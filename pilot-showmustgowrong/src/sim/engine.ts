import {
  AD_EFFECT_PICKS,
  AD_GAUGE_RELIEF,
  BROADCAST_STEPS,
  CORNER_STEPS,
  LEAP_VERTICAL_RATIO,
  LIGHT_DARKNESS_INTENSITY,
  RATING_LIMITS,
  SILENCE_SECONDS,
  STEP_SECONDS,
  STUDIO_HEIGHT,
  STUDIO_WIDTH,
  TOLERANCE_COUNT,
  VIEW_LOG_LINES,
  WALKOUT_INTENSITY,
  WALKOUT_SECONDS,
  WALKOUT_SPEED,
  gaugeRiskIncrease,
} from '@/content/balance'
import { GAUGE_KINDS } from '@/content/types'
import type {
  ActionDef,
  CameraDef,
  EmitDef,
  EquipmentDef,
  GaugeKind,
  Intensity,
  MoveDef,
  PerformerDef,
  Pose,
  ReactionDef,
  StaffDef,
  StaffDirectiveDef,
  TargetSelector,
} from '@/content/types'
import { validateShow } from '@/content/validate'
import { createRng, nextFloat, type RngState } from '@/kit/rng'
import { BroadcastScore, inFrame } from './broadcast'
import { Cast, STANDING_Y, type CastMember, type Point } from './cast'
import { describeEvent, withSubject } from './describe'
import { Director, type AdEffect } from './director'
import { EventLog, type PhenomenonEvent } from './phenomena'
import { PhysicsWorld, initPhysics, type Contact } from './physics'
import {
  ShowValidationError,
  type ActorView,
  type AutoSlowmo,
  type BroadcastInput,
  type BroadcastSetup,
  type BroadcastSummary,
  type BroadcastView,
  type ChainLine,
  type EquipmentView,
  type InputRecord,
  type LogLine,
  type Phase,
} from './engineTypes'
import { CooldownTable, cooldownKey, resolveReactions, type ReactorView } from './reactions'

export * from './engineTypes'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const WALKOUT_STEPS = Math.round(WALKOUT_SECONDS / STEP_SECONDS)
const INTENSITIES: readonly Intensity[] = [1, 2, 3]
const MAX_INTENSITY: Intensity = 3
const LAST_CORNER_INDEX = 2

/** 이름이 있는 대상. 위치가 없으면(방송 자체 등) 이동 방향을 정하지 않는다. */
interface Target {
  id: string | null
  position: Point | null
}

const NO_TARGET: Target = { id: null, position: null }

/** 행동을 하거나 현상을 내뿜는 주체 */
interface Emitter {
  id: string
  position: Point
}

function secondsToSteps(seconds: number): number {
  return Math.max(1, Math.round(seconds * STEPS_PER_SECOND))
}

/** from에서 to를 보는 각도(도). +x가 0도, 반시계로 증가한다(Ruling 15). */
function angleBetween(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

function cloneInput(input: BroadcastInput): BroadcastInput {
  return input.type === 'ad' ? { type: 'ad', effects: [...input.effects] } : { ...input }
}

function isPhenomenonShown(event: PhenomenonEvent): boolean {
  return event.kind !== 'gaze' && event.kind !== 'silence'
}

/**
 * 생방송 한 회의 시뮬레이션. 모든 상태 변화는 BroadcastInput과 시드 rng로만 일어난다.
 * 이벤트는 생긴 다음 스텝에 반응으로 판정되므로 한 스텝에 한 단계만 전파된다.
 */
export class Broadcast {
  private readonly setup: BroadcastSetup
  private readonly physics: PhysicsWorld
  private readonly cast: Cast
  private readonly score: BroadcastScore
  private readonly director: Director
  private readonly log = new EventLog()
  private readonly cooldowns = new CooldownTable()
  private readonly cameras = new Map<string, CameraDef>()
  private readonly cameraAngles: Record<string, number> = {}
  private readonly staff = new Map<string, StaffDef>()
  private readonly equipment = new Map<string, EquipmentDef>()
  /** 부서진 장비 id → 부순 충격 이벤트. 떨어지는 장비가 일으킨 충격의 원인이 된다. */
  private readonly brokenEquipment = new Map<string, PhenomenonEvent>()
  private readonly darkZones: { minX: number; maxX: number }[] = []
  private readonly benchQueue: PerformerDef[]
  private readonly names: Record<string, string> = {}

  private rng: RngState
  private stepCount = 0
  private currentPhase: Phase = 'live'
  private onAirCameraId: string
  /** 직전 스텝에 생겨 이번 스텝에 판정할 이벤트 */
  private pendingEvents: PhenomenonEvent[] = []
  /** 이번 스텝에 생긴 이벤트. 광고로 멈춘 스텝은 재개 뒤에도 이어서 쌓는다. */
  private currentEvents: PhenomenonEvent[] = []
  private silentSteps = 0
  private readonly lines: LogLine[] = []
  private deepestEvent: PhenomenonEvent | null = null
  private autoSlowmo: AutoSlowmo | null = null
  private readonly slowmoGauges = new Set<GaugeKind>()
  private readonly inputs: InputRecord[] = []

  private constructor(setup: BroadcastSetup, physics: PhysicsWorld) {
    this.setup = setup
    this.physics = physics
    this.rng = createRng(setup.seed)
    this.score = new BroadcastScore(setup.show)
    this.director = new Director([...setup.performers, ...setup.bench], setup.staff)
    this.cast = new Cast(physics)
    this.benchQueue = [...setup.bench]

    const [firstCamera] = setup.show.cameras
    if (firstCamera === undefined) throw new Error('카메라가 없는 쇼입니다.')
    this.onAirCameraId = firstCamera.id
    for (const camera of setup.show.cameras) {
      this.cameras.set(camera.id, camera)
      this.cameraAngles[camera.id] = camera.defaultAngle
      this.names[camera.id] = camera.label
    }
    for (const member of setup.staff) {
      this.staff.set(member.id, member)
      this.names[member.id] = member.shortName
    }
    for (const piece of setup.equipment) {
      this.equipment.set(piece.id, piece)
      this.names[piece.id] = piece.name
      physics.addEquipment(piece)
    }
    for (const performer of [...setup.performers, ...setup.bench]) {
      this.names[performer.id] = performer.shortName
    }
    setup.performers.forEach((performer, index) => {
      this.addToStage(performer, setup.show.homeSpots[index].x)
    })
  }

  /** 콘텐츠를 검증하고(spec 9.6) 물리 월드를 만든다. */
  static async create(setup: BroadcastSetup): Promise<Broadcast> {
    const errors = validateShow(
      setup.show,
      [...setup.performers, ...setup.bench],
      setup.staff,
      setup.equipment,
    )
    if (errors.length > 0) throw new ShowValidationError(errors)
    if (setup.performers.length > setup.show.homeSpots.length) {
      throw new Error(
        `home spot(${setup.show.homeSpots.length})보다 출연자(${setup.performers.length})가 많습니다.`,
      )
    }

    await initPhysics()
    const physics = new PhysicsWorld()
    try {
      return new Broadcast(setup, physics)
    } catch (error) {
      physics.dispose()
      throw error
    }
  }

  get phase(): Phase {
    return this.currentPhase
  }

  /** 지금까지 끝낸 스텝 수 = 다음에 돌 스텝 번호 */
  get currentStep(): number {
    return this.stepCount
  }

  /**
   * 한 스텝. live가 아니면 아무것도 하지 않는다. 광고 입력이 들어오면 입력만 적용하고
   * 스텝을 멈춘다(스텝 수도 그대로). resumeFromAd 뒤 같은 스텝 번호로 다시 돈다.
   */
  step(inputs: readonly BroadcastInput[] = []): void {
    if (this.currentPhase !== 'live') return

    // 1. 입력
    for (const input of inputs) {
      const recorded = cloneInput(input)
      this.applyInput(recorded)
      this.inputs.push({ step: this.stepCount, input: recorded })
    }
    // 광고 입력이 phase를 바꿨을 수 있다(필드는 위 검사로 'live'로 좁혀져 있어 getter로 읽는다).
    if (this.phase === 'adBreak') return
    this.advanceWalkouts()
    // 2. 코너 시작
    this.startCornerIfDue()
    // 3. 물리와 충격, 장비 파손
    this.stepPhysics()
    // 4. 직전 스텝 이벤트에 대한 반응(한 스텝에 한 단계)
    this.resolvePendingReactions()
    // 5. 카메라 시선
    this.updateGaze()
    // 6. 송출 판정과 점수
    const aired = this.scoreAiredEvents()
    // 7. 정적
    this.updateSilence(aired)
    // 8. 초 단위 집계
    if ((this.stepCount + 1) % STEPS_PER_SECOND === 0) this.score.tickSecond(this.silenceLevel())

    this.stepCount += 1
    // 9. 방송 중단과 종료
    if (this.score.checkHalt() !== null || this.stepCount >= BROADCAST_STEPS) {
      this.currentPhase = 'ended'
    }
    // 10. 자동 슬로모션
    this.updateAutoSlowmo(aired)

    this.pendingEvents = this.currentEvents
    this.currentEvents = []
  }

  /** 광고를 끝내고 방송으로 돌아온다. */
  resumeFromAd(): void {
    if (this.currentPhase !== 'adBreak') {
      throw new Error(`광고 중이 아닙니다: ${this.currentPhase}`)
    }
    this.currentPhase = 'live'
  }

  view(): BroadcastView {
    const rating = this.setup.show.rating
    return {
      step: this.stepCount,
      phase: this.currentPhase,
      cornerIndex: Math.min(LAST_CORNER_INDEX, Math.floor(this.stepCount / CORNER_STEPS)) as 0 | 1 | 2,
      onAirCameraId: this.onAirCameraId,
      cameraAngles: { ...this.cameraAngles },
      actors: this.cast.all().map((member) => this.actorView(member)),
      equipment: [...this.equipment.keys()].map((id) => this.equipmentView(id)),
      viewers: this.score.viewers,
      gauges: { ...this.score.gauges },
      limits: { ...RATING_LIMITS[rating] },
      haltedBy: this.score.haltedBy,
      log: this.lines.slice(-VIEW_LOG_LINES).map((line) => ({ ...line })),
      autoSlowmo: this.autoSlowmo === null ? null : { ...this.autoSlowmo },
      adsLeft: this.director.adsLeft,
      fatigue: this.director.fatigue,
    }
  }

  inputLog(): InputRecord[] {
    return this.inputs.map(({ step, input }) => ({ step, input: cloneInput(input) }))
  }

  /** 지금까지 생긴 모든 현상 이벤트(복사본) */
  events(): PhenomenonEvent[] {
    return this.log.since(0).map((event) => ({ ...event }))
  }

  /** 가장 깊은 연쇄의 문장들(뿌리부터). 광고로 끊긴 앞부분은 포함하지 않는다. */
  longestChain(): ChainLine[] {
    if (this.deepestEvent === null) return []
    return this.log
      .chain(this.deepestEvent.id)
      .slice(-this.deepestEvent.depth)
      .map((event) => ({ step: event.step, text: this.describe(event), depth: event.depth }))
  }

  summary(): BroadcastSummary {
    return {
      peakViewers: this.score.peakViewers,
      averageViewers: this.score.averageViewers(),
      eventCount: this.log.since(0).length,
      maxChainDepth: this.deepestEvent?.depth ?? 0,
    }
  }

  /** 물리 월드(wasm 메모리)를 해제한다. 이후 step은 오류를 던진다. */
  dispose(): void {
    this.physics.dispose()
  }

  // ── 입력 ──────────────────────────────────────────────

  private applyInput(input: BroadcastInput): void {
    switch (input.type) {
      case 'switch':
        this.requireCamera(input.cameraId)
        this.onAirCameraId = input.cameraId
        return
      case 'direct':
        this.directPerformer(input.actorId, input.directiveId)
        return
      case 'directStaff':
        this.directStaff(input.staffId, input.directiveId)
        return
      case 'ad':
        this.takeAd(input.effects)
        return
    }
  }

  private directPerformer(actorId: string, directiveId: string): void {
    const member = this.cast.get(actorId)
    if (member === undefined) throw new Error(`무대에 없는 출연자입니다: ${actorId}`)
    const [outcome, rng] = this.director.directPerformer(actorId, directiveId, this.rng)
    this.rng = rng
    if (outcome.kind === 'walkout') {
      this.walkOut(member)
      return
    }
    this.executeAction(member, outcome.action, null)
  }

  private directStaff(staffId: string, directiveId: string): void {
    const member = this.staff.get(staffId)
    if (member === undefined) throw new Error(`알 수 없는 스태프입니다: ${staffId}`)
    const [result, rng] = this.director.directStaff(staffId, directiveId, this.rng)
    this.rng = rng
    this.aimCamera(member.cameraId, result.aim)
  }

  private aimCamera(cameraId: string, aim: StaffDirectiveDef['aim'] | 'random'): void {
    const camera = this.requireCamera(cameraId)
    switch (aim) {
      case 'default':
        this.cameraAngles[cameraId] = camera.defaultAngle
        return
      case 'audience':
        this.cameraAngles[cameraId] = angleBetween(camera.position, this.audiencePosition())
        return
      case 'nearestPerformer': {
        const nearest = this.cast.nearestActive(camera.position, null)
        if (nearest === undefined) return
        this.cameraAngles[cameraId] = angleBetween(camera.position, this.cast.position(nearest))
        return
      }
      case 'random':
        this.cameraAngles[cameraId] = this.randomAngle()
        return
    }
  }

  /** Ruling 4: 광고는 입력 하나로 효과와 대가를 적용하고 adBreak로 들어간다. */
  private takeAd(effects: readonly AdEffect[]): void {
    if (effects.length !== AD_EFFECT_PICKS) {
      throw new Error(`광고 효과는 ${AD_EFFECT_PICKS}개를 골라야 합니다: ${effects.length}개`)
    }
    if (new Set(effects).size !== effects.length) {
      throw new Error(`같은 광고 효과를 두 번 고를 수 없습니다: ${effects.join(', ')}`)
    }
    if (!this.director.takeAd()) throw new Error('남은 광고가 없습니다.')

    for (const effect of effects) {
      switch (effect) {
        case 'relief':
          this.score.relieveGauges(AD_GAUGE_RELIEF)
          break
        case 'reset':
          this.resetCast()
          break
        case 'setup':
          this.bringInBench()
          break
      }
    }
    this.score.applyAdLoss()
    this.log.breakChains()
    this.silentSteps = 0
    this.currentPhase = 'adBreak'
  }

  private resetCast(): void {
    const members = this.cast.active()
    // 아직 옛 자리에 있는 다른 출연자와 겹치면 옆으로 비켜 서므로, 모두 옮긴 뒤 한 번 더 세운다.
    for (let pass = 0; pass < 2; pass++) {
      for (const member of members) this.physics.teleport(member.def.id, member.homeX)
    }
    for (const member of members) {
      member.pose = 'idle'
      member.motionCause = null
    }
    this.cooldowns.clear()
    this.director.resetFatigue()
  }

  /** 대기 출연자를 빈 home spot(없으면 bench 자리)에 올린다. */
  private bringInBench(): void {
    const performer = this.benchQueue.shift()
    if (performer === undefined) return
    const taken = new Set(this.cast.active().map((member) => member.homeX))
    const spot = this.setup.show.homeSpots.find((candidate) => !taken.has(candidate.x))
    this.addToStage(performer, spot?.x ?? this.setup.show.benchSpot.x)
  }

  private addToStage(performer: PerformerDef, homeX: number): void {
    const member = this.cast.add(performer, homeX)
    // 처음부터 화면에 있던 출연자는 '새로 잡힘'으로 치지 않는다.
    member.wasOnAir = this.isOnAir(this.cast.position(member))
  }

  // ── 이탈 ──────────────────────────────────────────────

  private walkOut(member: CastMember): void {
    member.walkedOut = true
    member.walkoutStep = this.stepCount
    member.pose = 'angry'
    member.motionCause = null
    const position = this.cast.position(member)
    this.addLine(`${withSubject(member.def.shortName)} 방송을 박차고 나간다!`, 1, null, position)
    for (const kind of ['anger', 'noise'] as const) {
      this.emit({
        kind,
        intensity: WALKOUT_INTENSITY,
        sourceId: member.def.id,
        targetId: null,
        ...position,
        causeId: null,
      })
    }
    this.walkTowardExit(member)
  }

  /** 이탈자는 출구로 걸어가다가 WALKOUT_SECONDS 뒤 물리 월드에서 빠진다. */
  private advanceWalkouts(): void {
    for (const member of this.cast.present()) {
      if (member.walkoutStep === null) continue
      if (this.stepCount - member.walkoutStep >= WALKOUT_STEPS) {
        this.cast.depart(member)
      } else {
        this.walkTowardExit(member)
      }
    }
  }

  private walkTowardExit(member: CastMember): void {
    const state = this.physics.actorState(member.def.id)
    if (state === undefined || state.tumbling) return
    const direction = Math.sign(this.setup.show.exitX - state.x)
    // 위로 속도를 주면 넘어지므로 수직 속도는 떨어지는 쪽만 유지한다.
    this.physics.impulse(member.def.id, direction * WALKOUT_SPEED, Math.min(state.vy, 0))
  }

  // ── 코너, 물리, 반응, 시선 ─────────────────────────────

  private startCornerIfDue(): void {
    if (this.stepCount % CORNER_STEPS !== 0) return
    const corner = this.setup.show.corners[this.stepCount / CORNER_STEPS]
    if (corner === undefined) return
    for (const member of this.cast.active()) {
      if (!member.def.tags.includes(corner.startTag)) continue
      const reaction = member.def.reactions.find(
        ({ trigger }) => trigger.kind === 'corner' && trigger.tag === corner.startTag,
      )
      if (reaction === undefined || !this.rollChance(reaction.chance)) continue
      this.executeAction(member, reaction.action, null)
    }
  }

  private stepPhysics(): void {
    for (const contact of this.physics.step()) {
      const impact = this.emitImpact(contact)
      for (const id of [contact.a, contact.b]) {
        const piece = this.equipment.get(id)
        if (piece === undefined || this.brokenEquipment.has(id)) continue
        if (contact.intensity >= piece.breakAt) this.breakEquipment(piece, impact)
      }
    }
  }

  /** source는 더 빨랐던 쪽(Ruling 9), 원인은 그 쪽을 움직이게 한 이벤트다. */
  private emitImpact(contact: Contact): PhenomenonEvent {
    const sourceId = contact.fasterId
    const targetId = contact.b === 'floor' ? null : sourceId === contact.a ? contact.b : contact.a
    const position = this.entityPosition(sourceId)
    if (position === undefined) throw new Error(`접촉한 물리 몸을 찾을 수 없습니다: ${sourceId}`)
    const cause = this.motionCauseOf(sourceId)
    const impact = this.emit({
      kind: 'impact',
      intensity: contact.intensity,
      sourceId,
      targetId,
      ...position,
      causeId: cause?.id ?? null,
    })
    // 맞은 출연자는 이제 이 충격 때문에 움직인다(날아간 출연자가 다음 충돌의 원인을 잇는다).
    const hit = targetId === null ? undefined : this.cast.get(targetId)
    if (hit !== undefined) hit.motionCause = impact
    return impact
  }

  private breakEquipment(piece: EquipmentDef, impact: PhenomenonEvent): void {
    this.physics.releaseEquipment(piece.id)
    this.brokenEquipment.set(piece.id, impact)
    const position = this.entityPosition(piece.id) ?? piece.position
    this.emitAll({ id: piece.id, position }, piece.onBreak, impact)
    if (piece.kind !== 'hangingLight' || piece.darknessZone === undefined) return

    const zone = piece.darknessZone
    this.darkZones.push(zone)
    this.emit({
      kind: 'darkness',
      intensity: LIGHT_DARKNESS_INTENSITY,
      sourceId: piece.id,
      targetId: null,
      x: (zone.minX + zone.maxX) / 2,
      y: STANDING_Y,
      causeId: impact.id,
    })
  }

  private resolvePendingReactions(): void {
    if (this.pendingEvents.length === 0) return
    const reactors: ReactorView[] = [
      ...this.cast.active().map((member) => {
        const position = this.cast.position(member)
        return {
          id: member.def.id,
          ...position,
          inDarkness: this.inDarkness(position),
          reactions: member.def.reactions,
          walkedOut: false,
        }
      }),
      ...[...this.staff.values()].map((member) => ({
        id: member.id,
        ...this.requireCamera(member.cameraId).position,
        inDarkness: false,
        reactions: member.reactions,
        walkedOut: false,
      })),
    ]
    const [planned, rng] = resolveReactions(
      this.pendingEvents,
      reactors,
      this.cooldowns,
      this.stepCount,
      this.rng,
      (event) => this.describe(event),
    )
    this.rng = rng

    for (const plan of planned) {
      const member = this.cast.get(plan.actorId)
      if (member !== undefined) {
        this.executeAction(member, plan.action, plan.cause)
        continue
      }
      const staffMember = this.staff.get(plan.actorId)
      if (staffMember !== undefined) this.panicCamera(staffMember, plan.cause)
    }
  }

  /** 스태프 반응은 행동 대신 담당 카메라를 무작위 방향으로 돌린다(겁쟁이 카메라 감독). */
  private panicCamera(member: StaffDef, cause: PhenomenonEvent | null): void {
    const camera = this.requireCamera(member.cameraId)
    this.cameraAngles[camera.id] = this.randomAngle()
    this.addLine(
      `${withSubject(member.shortName)} 놀라 카메라를 휘둘렀다`,
      (cause?.depth ?? 0) + 1,
      null,
      camera.position,
    )
  }

  private updateGaze(): void {
    const camera = this.onAirCamera()
    for (const member of this.cast.active()) {
      const position = this.cast.position(member)
      const onAir = this.isOnAir(position)
      const entered = onAir && !member.wasOnAir
      member.wasOnAir = onAir
      member.absentSteps = onAir ? 0 : member.absentSteps + 1

      for (const reaction of member.def.reactions) {
        const { trigger } = reaction
        if (trigger.kind !== 'gaze') continue
        const due =
          trigger.when === 'enter'
            ? entered
            : member.absentSteps > 0 && member.absentSteps % secondsToSteps(trigger.seconds) === 0
        if (!due) continue
        if (this.fireGazeReaction(member, reaction, trigger.when === 'enter' ? camera : null)) break
      }
    }
  }

  /** camera가 null이면 오래 화면에 잡히지 않은 것(absentFor)이다. 실행했으면 true. */
  private fireGazeReaction(
    member: CastMember,
    reaction: ReactionDef,
    camera: CameraDef | null,
  ): boolean {
    const key = cooldownKey(reaction.trigger)
    if (!this.cooldowns.ready(member.def.id, key, this.stepCount)) return false
    if (!this.rollChance(reaction.chance)) return false
    this.cooldowns.mark(member.def.id, key, this.stepCount)

    const gaze = this.emit({
      kind: 'gaze',
      intensity: camera?.shotIntensity ?? 1,
      sourceId: camera?.id ?? 'broadcast',
      targetId: member.def.id,
      ...this.cast.position(member),
      causeId: null,
    })
    this.executeAction(member, reaction.action, gaze)
    return true
  }

  // ── 송출, 정적, 슬로모션 ───────────────────────────────

  private scoreAiredEvents(): PhenomenonEvent[] {
    const aired = this.currentEvents.filter((event) => this.isAired(event))
    for (const event of aired) {
      this.score.scoreEvent(event, this.presenceOf(event.sourceId), this.hitMultiplierOf(event))
    }

    for (const member of this.cast.present()) {
      const rates = member.def.onAirGaugePerSecond
      if (rates === undefined || !this.isOnAir(this.cast.position(member))) continue
      for (const kind of GAUGE_KINDS) {
        const rate = rates[kind]
        if (rate !== undefined) this.score.addGauge(kind, rate / STEPS_PER_SECOND)
      }
    }
    return aired
  }

  /** 이벤트 위치나 source·target 출연자가 송출 화면 안이면 송출된 것이다. */
  private isAired(event: PhenomenonEvent): boolean {
    if (this.isOnAir(event)) return true
    return [event.sourceId, event.targetId].some((id) => {
      const member = id === null ? undefined : this.cast.get(id)
      return member !== undefined && member.departedAt === null && this.isOnAir(this.cast.position(member))
    })
  }

  /** Ruling 3: 출연자가 아닌 source의 존재감은 1이다. */
  private presenceOf(sourceId: string): 1 | 2 | 3 {
    return this.cast.get(sourceId)?.def.presence ?? 1
  }

  /** 충격에 얽힌 출연자 중 가장 큰 폭력성 배율(예: 할머니가 얽히면 더 폭력적으로 보인다). */
  private hitMultiplierOf(event: PhenomenonEvent): number {
    if (event.kind !== 'impact') return 1
    const multipliers = [event.sourceId, event.targetId].map((id) =>
      id === null ? 1 : (this.cast.get(id)?.def.hitViolenceMultiplier ?? 1),
    )
    return Math.max(...multipliers)
  }

  private updateSilence(aired: PhenomenonEvent[]): void {
    this.silentSteps = aired.some(isPhenomenonShown) ? 0 : this.silentSteps + 1
    const intensity = INTENSITIES.find(
      (candidate) => this.silentSteps === secondsToSteps(SILENCE_SECONDS[candidate]),
    )
    if (intensity === undefined) return
    this.emit({
      kind: 'silence',
      intensity,
      sourceId: 'broadcast',
      targetId: null,
      x: STUDIO_WIDTH / 2,
      y: STUDIO_HEIGHT / 2,
      causeId: null,
    })
  }

  private silenceLevel(): 0 | Intensity {
    let level: 0 | Intensity = 0
    for (const intensity of INTENSITIES) {
      if (this.silentSteps >= secondsToSteps(SILENCE_SECONDS[intensity])) level = intensity
    }
    return level
  }

  /** 게이지가 상한의 80%에 처음 이르거나(게이지마다 한 번) 강도 3 현상이 송출되면 건다. */
  private updateAutoSlowmo(aired: PhenomenonEvent[]): void {
    const step = this.stepCount - 1
    const newGauge = this.score.nearLimitGauges().find((gauge) => !this.slowmoGauges.has(gauge))
    if (newGauge !== undefined) {
      this.slowmoGauges.add(newGauge)
      const trigger = aired.findLast(
        (event) => gaugeRiskIncrease(event.kind, event.intensity)[newGauge] !== undefined,
      )
      this.autoSlowmo = { gauge: newGauge, eventId: trigger?.id ?? null, step }
      return
    }
    const strong = aired.find((event) => isPhenomenonShown(event) && event.intensity === MAX_INTENSITY)
    if (strong !== undefined) this.autoSlowmo = { gauge: null, eventId: strong.id, step }
  }

  // ── 행동 실행 ─────────────────────────────────────────

  private executeAction(member: CastMember, action: ActionDef, cause: PhenomenonEvent | null): void {
    member.pose = action.pose
    member.motionCause = cause
    const emitter: Emitter = { id: member.def.id, position: this.cast.position(member) }
    if (action.move !== undefined) this.move(member, emitter, action.move, cause)
    this.emitAll(emitter, action.emits, cause)
  }

  private move(member: CastMember, emitter: Emitter, move: MoveDef, cause: PhenomenonEvent | null): void {
    const id = member.def.id
    if (move.type === 'home') {
      this.physics.teleport(id, member.homeX)
      return
    }
    const target = this.resolveTarget(move.toward, emitter, cause).position
    const direction = target === null ? 0 : Math.sign(target.x - emitter.position.x)
    switch (move.type) {
      case 'dash':
        if (direction !== 0) this.physics.impulse(id, direction * move.speed, 0)
        return
      case 'leap':
        this.physics.impulse(id, direction * move.speed, move.speed * LEAP_VERTICAL_RATIO)
        return
      case 'flee':
        if (direction !== 0) this.physics.impulse(id, -direction * move.speed, 0)
        return
    }
  }

  private emitAll(emitter: Emitter, emits: readonly EmitDef[], cause: PhenomenonEvent | null): void {
    for (const emit of emits) {
      const intensity =
        emit.intensity === 'causePlusOne'
          ? (Math.min(MAX_INTENSITY, (cause?.intensity ?? 0) + 1) as Intensity)
          : emit.intensity
      this.emit({
        kind: emit.kind,
        intensity,
        sourceId: emitter.id,
        targetId: this.resolveTarget(emit.target, emitter, cause).id,
        ...emitter.position,
        causeId: cause?.id ?? null,
      })
    }
  }

  /** 이탈한 출연자를 가리키는 선택은 'none'과 같다(Review Focus 2). */
  private resolveTarget(
    selector: TargetSelector,
    emitter: Emitter,
    cause: PhenomenonEvent | null,
  ): Target {
    if (selector === 'none') return NO_TARGET
    if (selector === 'self') return { id: emitter.id, position: emitter.position }
    if (selector === 'cause') return cause === null ? NO_TARGET : this.targetById(cause.sourceId)
    if (selector === 'onAirCamera') {
      const camera = this.onAirCamera()
      return { id: camera.id, position: camera.position }
    }
    const tag = selector === 'nearestPerformer' ? undefined : selector.tag
    const nearest = this.cast.nearestActive(emitter.position, emitter.id, tag)
    return nearest === undefined
      ? NO_TARGET
      : { id: nearest.def.id, position: this.cast.position(nearest) }
  }

  private targetById(id: string): Target {
    const member = this.cast.get(id)
    if (member !== undefined) {
      return member.walkedOut ? NO_TARGET : { id, position: this.cast.position(member) }
    }
    if (id === 'audience') return { id, position: this.audiencePosition() }
    const position = this.entityPosition(id)
    return position === undefined ? NO_TARGET : { id, position }
  }

  /** 물리 몸이 있는 출연자, 장비, 카메라의 위치 */
  private entityPosition(id: string): Point | undefined {
    const member = this.cast.get(id)
    if (member !== undefined) return this.cast.position(member)
    const equipment = this.physics.equipmentState(id)
    if (equipment !== undefined) return { x: equipment.x, y: equipment.y }
    return this.cameras.get(id)?.position
  }

  private motionCauseOf(id: string): PhenomenonEvent | null {
    return this.cast.get(id)?.motionCause ?? this.brokenEquipment.get(id) ?? null
  }

  // ── 공통 ──────────────────────────────────────────────

  private emit(partial: Omit<PhenomenonEvent, 'id' | 'depth' | 'step'>): PhenomenonEvent {
    const event = this.log.emit({ ...partial, step: this.stepCount })
    this.currentEvents.push(event)
    if (this.deepestEvent === null || event.depth > this.deepestEvent.depth) {
      this.deepestEvent = event
    }
    this.addLine(this.describe(event), event.depth, event.id, event)
    return event
  }

  private addLine(text: string, depth: number, eventId: number | null, position: Point): void {
    this.lines.push({ step: this.stepCount, text, depth, eventId, x: position.x, y: position.y })
  }

  private describe(event: PhenomenonEvent): string {
    return describeEvent(event, this.names)
  }

  private rollChance(chance: number | undefined): boolean {
    if (chance === undefined) return true
    const [roll, rng] = nextFloat(this.rng)
    this.rng = rng
    return roll < chance
  }

  private randomAngle(): number {
    const [roll, rng] = nextFloat(this.rng)
    this.rng = rng
    return roll * 360
  }

  private requireCamera(cameraId: string): CameraDef {
    const camera = this.cameras.get(cameraId)
    if (camera === undefined) throw new Error(`알 수 없는 카메라입니다: ${cameraId}`)
    return camera
  }

  private onAirCamera(): CameraDef {
    return this.requireCamera(this.onAirCameraId)
  }

  private isOnAir(point: Point): boolean {
    const camera = this.onAirCamera()
    return inFrame(camera, this.cameraAngles[camera.id], point.x, point.y)
  }

  private inDarkness(point: Point): boolean {
    return this.darkZones.some((zone) => point.x >= zone.minX && point.x <= zone.maxX)
  }

  private audiencePosition(): Point {
    const zone = this.setup.show.audienceZone
    return { x: (zone.minX + zone.maxX) / 2, y: STANDING_Y }
  }

  private actorView(member: CastMember): ActorView {
    const placement = this.cast.placement(member)
    const pose: Pose = placement.tumbling ? (placement.grounded ? 'fallen' : 'flying') : member.pose
    const used = this.director.directivesUsed(member.def.id)
    return {
      id: member.def.id,
      name: member.def.name,
      x: placement.x,
      y: placement.y,
      angle: placement.angle,
      pose,
      onAir: member.departedAt === null && this.isOnAir(placement),
      walkedOut: member.walkedOut,
      directivesLeft: Math.max(0, TOLERANCE_COUNT[member.def.tolerance] - used),
    }
  }

  private equipmentView(id: string): EquipmentView {
    const state = this.physics.equipmentState(id)
    if (state === undefined) throw new Error(`물리 월드에 없는 장비입니다: ${id}`)
    return { id, ...state }
  }
}

/**
 * 입력 기록으로 방송을 처음부터 다시 돌린다(결정론 확인용). 광고 입력 뒤에는 바로 재개한다.
 * 끝나면 물리 월드를 해제한다.
 */
export async function replay(
  setup: BroadcastSetup,
  log: readonly InputRecord[],
  steps: number,
): Promise<BroadcastView> {
  const byStep = new Map<number, BroadcastInput[]>()
  for (const { step, input } of log) {
    const group = byStep.get(step) ?? []
    group.push(input)
    byStep.set(step, group)
  }

  const broadcast = await Broadcast.create(setup)
  try {
    let fedStep = -1
    while (broadcast.currentStep < steps && broadcast.phase !== 'ended') {
      const step = broadcast.currentStep
      // 광고로 멈춘 스텝은 같은 번호로 다시 돌므로 입력을 두 번 넣지 않는다.
      const inputs = step === fedStep ? [] : (byStep.get(step) ?? [])
      fedStep = step
      broadcast.step(inputs)
      if (broadcast.phase === 'adBreak') broadcast.resumeFromAd()
    }
    return broadcast.view()
  } finally {
    broadcast.dispose()
  }
}
