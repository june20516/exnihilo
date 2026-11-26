import {
  BIG_BURST_GRACE_BODY_SECONDS,
  BIG_BURST_MTB_BODY_SECONDS,
  HABIT_BOREDOM_SHORTEN,
  HABIT_COOLDOWN_SHOW_SECONDS,
  HABIT_INTERVAL_SHOW_SECONDS,
  INTENSE_EMIT_INTENSITY,
  INTENSE_SOURCE_INTENSITY,
  LIFE_RNG_SALT,
  LIFE_TICK_BODY_SECONDS,
  LIFE_TOP_REASON_COUNT,
  LOG_NUDGE_BODY_SECONDS,
  RECALL_SHOW_SECONDS,
  RESPONSE_COOLDOWN_SHOW_SECONDS,
  SMALL_BURST_COOLDOWN_SHOW_SECONDS,
  SMALL_BURST_MTB_SHOW_SECONDS,
  STAGE_LINE_COOLDOWN_SHOW_SECONDS,
  STEP_SECONDS,
} from '@/content/balance'
import type {
  ActionDef,
  BurstAction,
  EmotionDef,
  EmotionId,
  HabitDef,
  MindDef,
  MoodShift,
  PerformerDef,
  ShowDef,
} from '@/content/types'
import { createRng, forkSeed, nextFloat, type RngState } from '@/kit/rng'
import {
  clockCandidates,
  hasResponder,
  pickWeighted,
  resolveHabitTarget,
  responseCandidates,
  type HabitTargetResolved,
} from './habits'
import { Mind, type ActiveSituations, type Reason, type Stage } from './emotion'
import { perceives, targetsSelf, type Perceiver, type PhenomenonEvent } from './phenomena'
import { showSecondsToSteps, stepsToShowSeconds } from './showClock'

/** 엔진이 틱마다 넘기는 출연자 상태(활동 중인 무대 출연자만) */
export interface LifeMember {
  id: string
  x: number
  y: number
  z: number
  /** 화면(방송)에 잡히고 있는가 */
  onAir: boolean
  /** 넘어짐·날아감·이동 중이거나 마지막 행동 뒤 잠깐이라 버릇과 터짐을 미루는가(L5) */
  resting: boolean
  /** NEAR_RADIUS 안 다른 활동 출연자의 태그 */
  nearTags: readonly string[]
}

export interface LifeContext {
  step: number
  silence: boolean
  members: readonly LifeMember[]
  /** 로그에 마지막으로 줄이 새로 생긴 스텝(재촉 판정용). 묶여 repeat만 오른 것은 치지 않는다(Ruling 14) */
  lastLineStep: number
}

export type { HabitTargetResolved }

export type LifeOutput =
  | { type: 'stage'; actorId: string; emotion: EmotionDef; stage: 1 | 2 }
  | {
      type: 'burst'
      actorId: string
      emotion: EmotionDef
      size: 'small' | 'big'
      burst: BurstAction
      intense: boolean
      cause: PhenomenonEvent | null
      top: Reason[]
    }
  | {
      type: 'habit'
      actorId: string
      habit: HabitDef
      target: HabitTargetResolved
      cause: PhenomenonEvent | null
    }

export interface BurstRecord {
  step: number
  actorId: string
  emotion: EmotionId
  size: 'small' | 'big'
  stage2Step: number | null
}

export interface MoodView {
  emotion: EmotionId
  name: string
  stage: Stage
  stageName: string | null
  value: number
}

export interface EmotionView {
  id: EmotionId
  name: string
  value: number
  stage: Stage
  rise: [number, number]
  reasons: Reason[]
}

interface Actor {
  def: MindDef
  mind: Mind
  nextHabitStep: number
  habitUsedAt: Map<string, number>
  stageLineAt: Map<string, number>
  smallBurstAt: Map<EmotionId, number>
  lastResponseStep: number | null
  pendingResponse: PhenomenonEvent | null
  lastHabit: { habit: HabitDef; step: number } | null
}

/** tick 한 번 동안 출연자 한 명의 상태와 맥락을 묶은 것 */
interface Present {
  member: LifeMember
  actor: Actor
}

interface TickState {
  context: LifeContext
  present: Present[]
  outputs: LifeOutput[]
  /** 이번 틱에 터짐이나 응답을 낸 출연자(그 틱의 버릇은 미룬다) */
  acted: Set<string>
}

function bodySecondsToSteps(bodySeconds: number): number {
  return Math.max(1, Math.round(bodySeconds / STEP_SECONDS))
}

/** 감정 보기로 내보내는 이유. 사건 이유는 엔진 내부 이벤트 객체 대신 얕은 사본을 담는다 */
function reasonForView(reason: Reason): Reason {
  const { source } = reason
  if (source.type !== 'event') return reason
  return { ...reason, source: { type: 'event', event: { ...source.event } } }
}

/** 같은 출력이라도 원본 콘텐츠를 바꾸지 않도록 emit 강도를 올린 사본을 만든다 */
function intenseAction(action: ActionDef): ActionDef {
  return {
    ...action,
    emits: action.emits.map((emit) =>
      emit.intensity === INTENSE_SOURCE_INTENSITY
        ? { ...emit, intensity: INTENSE_EMIT_INTENSITY }
        : { ...emit },
    ),
  }
}

/** 모든 출연자의 감정, 감정·버릇 전용 난수, 버릇 시계를 묶어 틱마다 일어날 일을 출력한다. */
export class StudioLife {
  private readonly show: ShowDef
  private readonly actors = new Map<string, Actor>()
  private readonly records: BurstRecord[] = []
  private rng: RngState
  private readonly tickSteps = bodySecondsToSteps(LIFE_TICK_BODY_SECONDS)
  private readonly graceSteps = bodySecondsToSteps(BIG_BURST_GRACE_BODY_SECONDS)
  private readonly bigBurstChance =
    1 - Math.exp(-LIFE_TICK_BODY_SECONDS / BIG_BURST_MTB_BODY_SECONDS)
  private readonly smallBurstChance: number
  private readonly smallBurstCooldownSteps: number
  private readonly stageLineCooldownSteps: number
  private readonly habitCooldownSteps: number
  private readonly responseCooldownSteps: number
  private readonly nudgeSteps = bodySecondsToSteps(LOG_NUDGE_BODY_SECONDS)
  private readonly recallSteps: number

  constructor(show: ShowDef, seed: number) {
    this.show = show
    this.rng = createRng(forkSeed(seed, LIFE_RNG_SALT))
    const tickShowSeconds = stepsToShowSeconds(this.tickSteps, show)
    this.smallBurstChance = 1 - Math.exp(-tickShowSeconds / SMALL_BURST_MTB_SHOW_SECONDS)
    this.smallBurstCooldownSteps = showSecondsToSteps(SMALL_BURST_COOLDOWN_SHOW_SECONDS, show)
    this.stageLineCooldownSteps = showSecondsToSteps(STAGE_LINE_COOLDOWN_SHOW_SECONDS, show)
    this.habitCooldownSteps = showSecondsToSteps(HABIT_COOLDOWN_SHOW_SECONDS, show)
    this.responseCooldownSteps = showSecondsToSteps(RESPONSE_COOLDOWN_SHOW_SECONDS, show)
    this.recallSteps = showSecondsToSteps(RECALL_SHOW_SECONDS, show)
  }

  join(def: PerformerDef, step: number): void {
    if (!def.mind) return
    const mind = new Mind(def.mind, this.show, step)
    this.actors.set(def.id, {
      def: def.mind,
      mind,
      nextHabitStep: this.nextHabitStepFrom(mind, step),
      habitUsedAt: new Map(),
      stageLineAt: new Map(),
      smallBurstAt: new Map(),
      lastResponseStep: null,
      pendingResponse: null,
      lastHabit: null,
    })
  }

  leave(id: string): void {
    this.actors.delete(id)
  }

  has(id: string): boolean {
    return this.actors.has(id)
  }

  /** 매 스텝: 직전 스텝 이벤트 중 각 출연자가 인지한 것을 Mind에 넣고, 나를 향한 응답 대상이면 대기열에 둔다 */
  perceive(
    events: readonly PhenomenonEvent[],
    perceivers: readonly Perceiver[],
    step: number,
  ): void {
    for (const event of events) {
      for (const perceiver of perceivers) {
        const actor = this.actors.get(perceiver.id)
        if (!actor || !perceives(event, perceiver)) continue
        actor.mind.perceive(event, targetsSelf(event, perceiver.id), step)
        if (event.targetId === perceiver.id && hasResponder(actor.def.habits, event)) {
          actor.pendingResponse = event
        }
      }
    }
  }

  isTickStep(step: number): boolean {
    return step % this.tickSteps === 0
  }

  tick(context: LifeContext): LifeOutput[] {
    const present = this.presentMembers(context)
    const state: TickState = { context, present, outputs: [], acted: new Set() }
    this.advanceStages(state)
    this.rollBursts(state)
    this.rollResponses(state)
    this.runHabitClock(state)
    this.nudgeQuietLog(state)
    return state.outputs
  }

  addDirective(
    actorId: string,
    shifts: readonly MoodShift[],
    label: string,
    step: number,
  ): void {
    this.actors.get(actorId)?.mind.addDirective(shifts, label, step)
  }

  /** 재정비: 감정·후련함·단계·버릇 시계·응답 대기·쿨다운을 모두 처음으로 돌린다 */
  resetAll(step: number): void {
    for (const actor of this.actors.values()) {
      actor.mind.reset(step)
      actor.nextHabitStep = this.nextHabitStepFrom(actor.mind, step)
      actor.habitUsedAt.clear()
      actor.stageLineAt.clear()
      actor.smallBurstAt.clear()
      actor.lastResponseStep = null
      actor.pendingResponse = null
      actor.lastHabit = null
    }
  }

  /** RECALL_SHOW_SECONDS 안에서 그 출연자가 마지막으로 한 버릇(응답 포함, 터짐 제외) */
  recentHabit(actorId: string, step: number): HabitDef | null {
    const last = this.actors.get(actorId)?.lastHabit
    if (!last || step - last.step > this.recallSteps) return null
    return last.habit
  }

  /** 대표 감정: 단계가 가장 높은 것, 같으면 다음 문턱에 가장 가까운 것, 그것도 같으면 정의 순서 */
  mood(actorId: string): MoodView | null {
    const actor = this.actors.get(actorId)
    if (!actor) return null
    let best: { emotion: EmotionDef; stage: Stage; distance: number } | null = null
    for (const emotion of actor.mind.emotions) {
      const stage = actor.mind.stage(emotion.id)
      const distance = this.distanceToNextThreshold(actor, emotion.id, stage)
      const better =
        !best || stage > best.stage || (stage === best.stage && distance < best.distance)
      if (better) best = { emotion, stage, distance }
    }
    if (!best) return null
    return {
      emotion: best.emotion.id,
      name: best.emotion.name,
      stage: best.stage,
      stageName: best.stage === 0 ? null : best.emotion.stageNames[best.stage - 1],
      value: actor.mind.value(best.emotion.id),
    }
  }

  emotions(actorId: string): EmotionView[] {
    const actor = this.actors.get(actorId)
    if (!actor) return []
    return actor.mind.emotions.map((emotion) => ({
      id: emotion.id,
      name: emotion.name,
      value: actor.mind.value(emotion.id),
      stage: actor.mind.stage(emotion.id),
      rise: [...actor.mind.thresholds(emotion.id).rise],
      reasons: actor.mind.topReasons(emotion.id, LIFE_TOP_REASON_COUNT).map(reasonForView),
    }))
  }

  burstRecords(): BurstRecord[] {
    return this.records.map((record) => ({ ...record }))
  }

  // 1. 단계 변화: 올라가는 변화만, 도착 단계 하나만, 진입 줄 쿨다운 밖이면 출력
  private advanceStages(state: TickState): void {
    const { context, present, outputs } = state
    for (const { member, actor } of present) {
      const situations: ActiveSituations = {
        onAir: member.onAir,
        silence: context.silence,
        nearTags: member.nearTags,
        showTraits: this.show.traits,
      }
      for (const change of actor.mind.advance(situations, context.step)) {
        if (change.to <= change.from || change.to === 0) continue
        const emotion = this.emotionDef(actor, change.emotion)
        const key = `${change.emotion}:${change.to}`
        const lastAt = actor.stageLineAt.get(key)
        if (lastAt !== undefined && context.step - lastAt < this.stageLineCooldownSteps) continue
        actor.stageLineAt.set(key, context.step)
        outputs.push({ type: 'stage', actorId: member.id, emotion, stage: change.to })
      }
    }
  }

  // 2. 터짐: 출연자당 한 틱에 최대 1회, 큰 터짐을 먼저 본다
  private rollBursts(state: TickState): void {
    for (const { member, actor } of state.present) {
      if (member.resting) continue
      const { step } = state.context
      const roll = this.rollBigBurst(actor, step) ?? this.rollSmallBurst(actor, step)
      if (!roll) continue
      state.acted.add(member.id)
      state.outputs.push(this.burstOutput(member.id, actor, roll, step))
    }
  }

  private rollBigBurst(actor: Actor, step: number): BurstRoll | null {
    for (const emotion of actor.mind.emotions) {
      const stage2Since = actor.mind.stage2Since(emotion.id)
      if (actor.mind.stage(emotion.id) !== 2 || stage2Since === null) continue
      if (step - stage2Since < this.graceSteps || !actor.def.bursts[emotion.id]) continue
      if (this.roll() < this.bigBurstChance) return { def: emotion, size: 'big' }
    }
    return null
  }

  private rollSmallBurst(actor: Actor, step: number): BurstRoll | null {
    for (const emotion of actor.mind.emotions) {
      if (actor.mind.stage(emotion.id) < 1 || !actor.def.bursts[emotion.id]) continue
      const lastAt = actor.smallBurstAt.get(emotion.id)
      if (lastAt !== undefined && step - lastAt < this.smallBurstCooldownSteps) continue
      if (this.roll() < this.smallBurstChance) return { def: emotion, size: 'small' }
    }
    return null
  }

  private burstOutput(
    actorId: string,
    actor: Actor,
    { def: emotion, size }: BurstRoll,
    step: number,
  ): LifeOutput {
    const burstDef = actor.def.bursts[emotion.id]
    const source = size === 'big' ? burstDef.big : burstDef.small
    const top = actor.mind.topReasons(emotion.id, LIFE_TOP_REASON_COUNT)
    const intense =
      size === 'big' &&
      actor.mind.value(emotion.id) >= actor.mind.thresholds(emotion.id).intense
    const burst: BurstAction = {
      ...source,
      action: intense ? intenseAction(source.action) : source.action,
    }
    this.records.push({
      step,
      actorId,
      emotion: emotion.id,
      size,
      stage2Step: actor.mind.stage2Since(emotion.id),
    })
    if (size === 'big') {
      actor.mind.catharsis(emotion.id, step)
    } else {
      actor.mind.relieveSmall(emotion.id)
      actor.smallBurstAt.set(emotion.id, step)
    }
    const cause = top[0]?.source.type === 'event' ? top[0].source.event : null
    return { type: 'burst', actorId, emotion, size, burst, intense, cause, top }
  }

  // 3. 응답: 나를 향한 현상을 받은 출연자가 chance로 응수한다. 대기열은 틱마다 비운다
  private rollResponses(state: TickState): void {
    const { step } = state.context
    for (const { member, actor } of state.present) {
      const event = actor.pendingResponse
      if (!event || member.resting || state.acted.has(member.id)) continue
      if (this.inResponseCooldown(actor, step)) continue
      const candidates = responseCandidates(
        actor.def.habits,
        event,
        member,
        actor.mind,
        this.show,
      )
      const habit = pickWeighted(candidates, actor.mind, () => this.roll())
      if (!habit || this.roll() >= (habit.respondsTo?.chance ?? 0)) continue
      actor.lastResponseStep = step
      state.acted.add(member.id)
      state.outputs.push(this.habitOutput(member.id, actor, habit, event, step))
    }
    for (const actor of this.actors.values()) actor.pendingResponse = null
  }

  // 4. 버릇 시계: 시각이 된 출연자가 응답이 아닌 버릇 하나를 한다
  private runHabitClock(state: TickState): void {
    const { step } = state.context
    for (const { member, actor } of state.present) {
      if (step < actor.nextHabitStep || member.resting || state.acted.has(member.id)) continue
      this.performClockHabit(state, member, actor, this.clockHabits(actor, member, step))
    }
  }

  // 5. 재촉(L2): 줄이 한동안 없으면 다음 버릇 시각이 가장 이른 출연자가 지금 버릇을 한다
  private nudgeQuietLog(state: TickState): void {
    const { step, lastLineStep } = state.context
    if (state.outputs.length > 0 || step - lastLineStep < this.nudgeSteps) return
    let chosen: { entry: Present; candidates: HabitDef[] } | null = null
    for (const entry of state.present) {
      if (entry.member.resting) continue
      const candidates = this.clockHabits(entry.actor, entry.member, step)
      if (candidates.length === 0) continue
      if (!chosen || entry.actor.nextHabitStep < chosen.entry.actor.nextHabitStep) {
        chosen = { entry, candidates }
      }
    }
    if (chosen) {
      const { member, actor } = chosen.entry
      this.performClockHabit(state, member, actor, chosen.candidates)
    }
  }

  private performClockHabit(
    state: TickState,
    member: LifeMember,
    actor: Actor,
    candidates: readonly HabitDef[],
  ): void {
    const { step } = state.context
    const habit = pickWeighted(candidates, actor.mind, () => this.roll())
    if (!habit) return
    actor.nextHabitStep = this.nextHabitStepFrom(actor.mind, step)
    state.outputs.push(this.habitOutput(member.id, actor, habit, null, step))
  }

  private habitOutput(
    actorId: string,
    actor: Actor,
    habit: HabitDef,
    cause: PhenomenonEvent | null,
    step: number,
  ): LifeOutput {
    actor.habitUsedAt.set(habit.id, step)
    actor.lastHabit = { habit, step }
    return {
      type: 'habit',
      actorId,
      habit,
      target: resolveHabitTarget(habit, cause, actor.mind, (id) => this.has(id)),
      cause,
    }
  }

  private clockHabits(actor: Actor, member: LifeMember, step: number): HabitDef[] {
    return clockCandidates(
      actor.def.habits,
      member,
      actor.mind,
      this.show,
      actor.habitUsedAt,
      step,
      this.habitCooldownSteps,
    )
  }

  private inResponseCooldown(actor: Actor, step: number): boolean {
    return (
      actor.lastResponseStep !== null &&
      step - actor.lastResponseStep < this.responseCooldownSteps
    )
  }

  /** step + 균등(min, max) × 지루함 단축(극 중 초 → 스텝) */
  private nextHabitStepFrom(mind: Mind, step: number): number {
    const { min, max } = HABIT_INTERVAL_SHOW_SECONDS
    const interval = min + this.roll() * (max - min)
    const shorten = 1 - (HABIT_BOREDOM_SHORTEN * mind.value('boredom')) / 100
    return step + showSecondsToSteps(interval * shorten, this.show)
  }

  private distanceToNextThreshold(actor: Actor, emotion: EmotionId, stage: Stage): number {
    const thresholds = actor.mind.thresholds(emotion)
    const next = stage === 0 ? thresholds.rise[0] : stage === 1 ? thresholds.rise[1] : thresholds.intense
    return next - actor.mind.value(emotion)
  }

  private emotionDef(actor: Actor, id: EmotionId): EmotionDef {
    const emotion = actor.mind.emotions.find((candidate) => candidate.id === id)
    if (!emotion) throw new Error(`정의되지 않은 감정입니다: ${id}`)
    return emotion
  }

  private presentMembers(context: LifeContext): Present[] {
    const present: Present[] = []
    for (const member of context.members) {
      const actor = this.actors.get(member.id)
      if (actor) present.push({ member, actor })
    }
    return present
  }

  private roll(): number {
    const [value, next] = nextFloat(this.rng)
    this.rng = next
    return value
  }
}

interface BurstRoll {
  def: EmotionDef
  size: 'small' | 'big'
}
