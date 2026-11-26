import {
  DEFAULT_THRESHOLDS,
  EVENT_REASON_SHOW_SECONDS,
  INTENSITY_EMOTION_FACTOR,
  RELIEF_AMOUNT,
  RELIEF_SHOW_SECONDS,
  REPEAT_MULTIPLIERS,
  SITUATION_CAP,
  SITUATION_FADE_PER_SHOW_MINUTE,
  SMALL_BURST_KEEP,
} from '@/content/balance'
import type {
  EmotionDef,
  EmotionId,
  MindDef,
  MoodShift,
  ReasonLabel,
  SensitivityDef,
  Situation,
  ShowDef,
} from '@/content/types'
import type { PhenomenonEvent } from './phenomena'
import { stepsToShowSeconds } from './showClock'

export type ReasonSource =
  | { type: 'event'; event: PhenomenonEvent }
  | { type: 'situation'; key: string; label: ReasonLabel }
  | { type: 'directive'; label: string }
  | { type: 'relief' }

/** amount: 지금 이 이유가 감정에 기여하는 양(양수 또는 음수) */
export interface Reason {
  emotion: EmotionId
  source: ReasonSource
  amount: number
}

export interface StageChange {
  emotion: EmotionId
  from: Stage
  to: Stage
}

export interface ActiveSituations {
  /** 화면(방송)에 잡히고 있는가. offScreen은 이것의 반대다 */
  onAir: boolean
  silence: boolean
  nearTags: readonly string[]
  showTraits: readonly string[]
}

type Stage = 0 | 1 | 2

/** 시간이 지나며 줄어드는 이유(사건, 지시, 후련함)의 수명 정보 */
interface Decay {
  initial: number
  startStep: number
  showSeconds: number
}

/** decay가 없으면 상황 이유(누적기)다 */
interface StoredReason extends Reason {
  decay: Decay | null
}

const SECONDS_PER_MINUTE = 60

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function situationKey(situation: Situation): string {
  switch (situation.kind) {
    case 'offScreen':
    case 'onScreen':
    case 'silence':
      return situation.kind
    case 'nearTag':
      return `nearTag:${situation.tag}:${situation.present}`
    case 'showTrait':
      return `showTrait:${situation.trait}`
  }
}

function isSituationActive(
  situation: Situation,
  active: ActiveSituations,
): boolean {
  switch (situation.kind) {
    case 'offScreen':
      return !active.onAir
    case 'onScreen':
      return active.onAir
    case 'silence':
      return active.silence
    case 'nearTag':
      return active.nearTags.includes(situation.tag) === situation.present
    case 'showTrait':
      return active.showTraits.includes(situation.trait)
  }
}

type SituationSensitivity = Extract<SensitivityDef, { on: 'situation' }>

/** 출연자 한 명의 감정 상태. 난수를 쓰지 않으며 시간은 스텝으로 받는다. */
export class Mind {
  readonly emotions: readonly EmotionDef[]
  private readonly def: MindDef
  private readonly show: ShowDef
  private reasons: StoredReason[] = []
  private stages = new Map<EmotionId, Stage>()
  private stage2Steps = new Map<EmotionId, number>()
  private lastStep: number

  constructor(def: MindDef, show: ShowDef, step: number) {
    this.def = def
    this.show = show
    this.emotions = def.emotions
    this.lastStep = step
  }

  perceive(event: PhenomenonEvent, targetsSelf: boolean, step: number): void {
    for (const sensitivity of this.def.sensitivities) {
      if (sensitivity.on !== 'event' || sensitivity.kind !== event.kind) continue
      if (sensitivity.scope === 'targetsSelf' && !targetsSelf) continue
      const sameReasons = this.reasons.filter(
        (reason) =>
          reason.emotion === sensitivity.emotion &&
          reason.source.type === 'event' &&
          reason.source.event.sourceId === event.sourceId &&
          reason.source.event.kind === event.kind &&
          this.isAlive(reason, step),
      )
      const amount =
        sensitivity.amount *
        INTENSITY_EMOTION_FACTOR[event.intensity] *
        this.repeatMultiplier(sameReasons.length)
      this.addDecaying(
        sensitivity.emotion,
        { type: 'event', event },
        amount,
        EVENT_REASON_SHOW_SECONDS,
        step,
      )
    }
  }

  addDirective(shifts: readonly MoodShift[], label: string, step: number): void {
    for (const shift of shifts) {
      const sameCount = this.reasons.filter(
        (reason) =>
          reason.emotion === shift.emotion &&
          reason.source.type === 'directive' &&
          reason.source.label === label &&
          this.isAlive(reason, step),
      ).length
      this.addDecaying(
        shift.emotion,
        { type: 'directive', label },
        shift.amount * this.repeatMultiplier(sameCount),
        EVENT_REASON_SHOW_SECONDS,
        step,
      )
    }
  }

  /** 마지막 advance부터 step까지 이유를 갱신하고 단계를 다시 정한다. 바뀐 단계만 돌려준다 */
  advance(situations: ActiveSituations, step: number): StageChange[] {
    const showMinutes =
      stepsToShowSeconds(step - this.lastStep, this.show) / SECONDS_PER_MINUTE
    this.lastStep = step
    this.updateDecaying(step)
    this.updateSituations(situations, showMinutes)
    return this.updateStages(step)
  }

  value(emotion: EmotionId): number {
    const baseline = this.def.baseline?.[emotion] ?? 0
    let total = baseline
    for (const reason of this.reasons) {
      if (reason.emotion === emotion) total += reason.amount
    }
    return clamp(total, 0, 100)
  }

  stage(emotion: EmotionId): Stage {
    return this.stages.get(emotion) ?? 0
  }

  stage2Since(emotion: EmotionId): number | null {
    return this.stage2Steps.get(emotion) ?? null
  }

  /** 그 감정에서 amount가 양수인 이유를 큰 순서로(같으면 먼저 생긴 순서) n개 */
  topReasons(emotion: EmotionId, n: number): Reason[] {
    return this.reasons
      .filter((reason) => reason.emotion === emotion && reason.amount > 0)
      .map((reason, order) => ({ reason, order }))
      .sort((a, b) => b.reason.amount - a.reason.amount || a.order - b.order)
      .slice(0, n)
      .map(({ reason }) => ({
        emotion: reason.emotion,
        source: reason.source,
        amount: reason.amount,
      }))
  }

  relieveSmall(emotion: EmotionId): void {
    for (const reason of this.reasons) {
      if (reason.emotion !== emotion || reason.amount <= 0) continue
      reason.amount *= SMALL_BURST_KEEP
      if (reason.decay) reason.decay.initial *= SMALL_BURST_KEEP
    }
  }

  catharsis(emotion: EmotionId, step: number): void {
    this.reasons = this.reasons.filter(
      (reason) => reason.emotion !== emotion || reason.amount <= 0,
    )
    this.addDecaying(
      emotion,
      { type: 'relief' },
      RELIEF_AMOUNT,
      RELIEF_SHOW_SECONDS,
      step,
    )
  }

  reset(step: number): void {
    this.reasons = []
    this.stages.clear()
    this.stage2Steps.clear()
    this.lastStep = step
  }

  private repeatMultiplier(aliveCount: number): number {
    const index = Math.min(aliveCount, REPEAT_MULTIPLIERS.length - 1)
    return REPEAT_MULTIPLIERS[index]
  }

  private addDecaying(
    emotion: EmotionId,
    source: ReasonSource,
    amount: number,
    showSeconds: number,
    step: number,
  ): void {
    this.reasons.push({
      emotion,
      source,
      amount,
      decay: { initial: amount, startStep: step, showSeconds },
    })
  }

  /** 아직 0으로 줄지 않은 사건·지시·후련함 이유인가 */
  private isAlive(reason: StoredReason, step: number): boolean {
    if (!reason.decay) return false
    return this.elapsedShowSeconds(reason.decay, step) < reason.decay.showSeconds
  }

  private elapsedShowSeconds(decay: Decay, step: number): number {
    return stepsToShowSeconds(step - decay.startStep, this.show)
  }

  private updateDecaying(step: number): void {
    this.reasons = this.reasons.filter((reason) => {
      if (!reason.decay) return true
      if (!this.isAlive(reason, step)) return false
      const elapsed = this.elapsedShowSeconds(reason.decay, step)
      reason.amount = reason.decay.initial * (1 - elapsed / reason.decay.showSeconds)
      return true
    })
  }

  private updateSituations(
    situations: ActiveSituations,
    showMinutes: number,
  ): void {
    const handled = new Set<string>()
    for (const sensitivity of this.def.sensitivities) {
      if (sensitivity.on !== 'situation') continue
      const key = situationKey(sensitivity.situation)
      const id = `${sensitivity.emotion}/${key}`
      if (handled.has(id)) continue
      handled.add(id)
      this.updateSituation(sensitivity, key, situations, showMinutes)
    }
  }

  private updateSituation(
    sensitivity: SituationSensitivity,
    key: string,
    situations: ActiveSituations,
    showMinutes: number,
  ): void {
    const existing = this.reasons.find(
      (reason) =>
        !reason.decay &&
        reason.emotion === sensitivity.emotion &&
        reason.source.type === 'situation' &&
        reason.source.key === key,
    )
    if (isSituationActive(sensitivity.situation, situations)) {
      const gain = sensitivity.perShowMinute * showMinutes
      if (existing) {
        existing.amount = Math.min(SITUATION_CAP, existing.amount + gain)
      } else if (gain > 0) {
        this.reasons.push({
          emotion: sensitivity.emotion,
          source: { type: 'situation', key, label: sensitivity.label },
          amount: Math.min(SITUATION_CAP, gain),
          decay: null,
        })
      }
      return
    }
    if (!existing) return
    const fade = sensitivity.fadePerShowMinute ?? SITUATION_FADE_PER_SHOW_MINUTE
    existing.amount -= fade * showMinutes
    if (existing.amount <= 0) {
      this.reasons = this.reasons.filter((reason) => reason !== existing)
    }
  }

  private updateStages(step: number): StageChange[] {
    const changes: StageChange[] = []
    for (const emotion of this.emotions) {
      const from = this.stage(emotion.id)
      const to = this.nextStage(emotion.id, from)
      if (to === from) continue
      this.stages.set(emotion.id, to)
      if (to === 2) this.stage2Steps.set(emotion.id, step)
      else this.stage2Steps.delete(emotion.id)
      changes.push({ emotion: emotion.id, from, to })
    }
    return changes
  }

  private nextStage(emotion: EmotionId, current: Stage): Stage {
    const thresholds = this.def.thresholds?.[emotion] ?? DEFAULT_THRESHOLDS
    const value = this.value(emotion)
    if (current === 2) {
      if (value < thresholds.fall[0]) return 0
      return value < thresholds.fall[1] ? 1 : 2
    }
    if (value >= thresholds.rise[1]) return 2
    if (current === 1) return value < thresholds.fall[0] ? 0 : 1
    return value >= thresholds.rise[0] ? 1 : 0
  }
}
