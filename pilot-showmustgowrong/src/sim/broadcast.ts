import {
  AD_VIEWER_LOSS,
  AUTO_SLOWMO_GAUGE_RATIO,
  CHAIN_BONUS_PER_DEPTH,
  INTENSITY_POINTS,
  NOVELTY,
  PRESENCE_MULTIPLIER,
  RATING_LIMITS,
  SILENCE_LOSS_PER_SECOND,
  VIEWERS_PER_POINT,
  VIEWERS_START,
  gaugeRiskIncrease,
} from '@/content/balance'
import { GAUGE_KINDS } from '@/content/types'
import type { CameraDef, GaugeKind, ShowDef } from '@/content/types'
import type { PhenomenonEvent } from './phenomena'
import { normalizeDegrees } from './vec'

const BOUNDARY_EPSILON = 1e-9

/**
 * (x, y)가 카메라 화면 안인지 판정한다.
 * 각도는 도 단위이며 +x가 0도, 반시계(+y가 위)로 증가한다. 경계값은 포함한다.
 */
export function inFrame(camera: CameraDef, angle: number, x: number, y: number): boolean {
  const dx = x - camera.position.x
  const dy = y - camera.position.y
  if (Math.hypot(dx, dy) > camera.range + BOUNDARY_EPSILON) return false
  if (dx === 0 && dy === 0) return true
  const direction = (Math.atan2(dy, dx) * 180) / Math.PI
  const difference = Math.abs(normalizeDegrees(direction - angle))
  return difference <= camera.fovDegrees / 2 + BOUNDARY_EPSILON
}

function emptyGauges(): Record<GaugeKind, number> {
  return { sexual: 0, violence: 0, drugs: 0, language: 0 }
}

export class BroadcastScore {
  private currentViewers = VIEWERS_START
  private currentPeakViewers = VIEWERS_START
  private readonly currentGauges: Record<GaugeKind, number> = emptyGauges()
  private currentHaltedBy: GaugeKind | null = null

  private readonly limits: Record<GaugeKind, number>
  private readonly airedCounts = new Map<string, number>()
  private viewerSamples: number[] = []

  constructor(show: ShowDef) {
    this.limits = RATING_LIMITS[show.rating]
  }

  get viewers(): number {
    return this.currentViewers
  }

  get peakViewers(): number {
    return this.currentPeakViewers
  }

  get gauges(): Readonly<Record<GaugeKind, number>> {
    return { ...this.currentGauges }
  }

  get haltedBy(): GaugeKind | null {
    return this.currentHaltedBy
  }

  /** 송출된 이벤트를 점수·시청자·게이지에 반영하고 점수를 돌려준다. */
  scoreEvent(
    event: PhenomenonEvent,
    sourcePresence: 1 | 2 | 3,
    hitViolenceMultiplier: number,
  ): number {
    if (event.kind === 'gaze' || event.kind === 'silence') return 0

    const countKey = `${event.sourceId}|${event.kind}`
    const airedBefore = this.airedCounts.get(countKey) ?? 0
    this.airedCounts.set(countKey, airedBefore + 1)
    const novelty = NOVELTY[Math.min(airedBefore, NOVELTY.length - 1)]

    const chainBonus = 1 + CHAIN_BONUS_PER_DEPTH * (event.depth - 1)
    const points =
      INTENSITY_POINTS[event.intensity] *
      novelty *
      chainBonus *
      PRESENCE_MULTIPLIER[sourcePresence]
    this.changeViewers(points * VIEWERS_PER_POINT)

    const increase = gaugeRiskIncrease(event.kind, event.intensity)
    for (const kind of GAUGE_KINDS) {
      const amount = increase[kind]
      if (amount === undefined) continue
      const multiplier = event.kind === 'impact' && kind === 'violence' ? hitViolenceMultiplier : 1
      this.addGauge(kind, amount * multiplier)
    }
    return points
  }

  addGauge(kind: GaugeKind, amount: number): void {
    this.currentGauges[kind] = Math.max(0, this.currentGauges[kind] + amount)
  }

  /** 1초마다 호출한다. 정적 이탈을 적용하고 평균 계산용 표본을 기록한다. */
  tickSecond(silenceIntensity: 0 | 1 | 2 | 3): void {
    if (silenceIntensity !== 0) {
      this.changeViewers(-this.viewers * SILENCE_LOSS_PER_SECOND[silenceIntensity])
    }
    this.viewerSamples.push(this.viewers)
  }

  /** 상한 이상인 첫 게이지를 방송 중단 원인으로 정한다. 한 번 정해지면 바뀌지 않는다. */
  checkHalt(): GaugeKind | null {
    if (this.currentHaltedBy !== null) return this.currentHaltedBy
    this.currentHaltedBy =
      GAUGE_KINDS.find((kind) => this.currentGauges[kind] >= this.limits[kind]) ?? null
    return this.currentHaltedBy
  }

  /** 상한의 AUTO_SLOWMO_GAUGE_RATIO 이상인 첫 게이지. 매번 현재 상태로 계산한다. */
  nearLimit(): GaugeKind | null {
    return this.nearLimitGauges()[0] ?? null
  }

  /** 상한의 AUTO_SLOWMO_GAUGE_RATIO 이상인 게이지 전부(정의 순서). */
  nearLimitGauges(): GaugeKind[] {
    return GAUGE_KINDS.filter(
      (kind) => this.currentGauges[kind] >= this.limits[kind] * AUTO_SLOWMO_GAUGE_RATIO,
    )
  }

  relieveGauges(amount: number): void {
    for (const kind of GAUGE_KINDS) this.addGauge(kind, -amount)
  }

  applyAdLoss(): void {
    this.changeViewers(-this.viewers * AD_VIEWER_LOSS)
  }

  averageViewers(): number {
    if (this.viewerSamples.length === 0) return this.viewers
    const total = this.viewerSamples.reduce((sum, sample) => sum + sample, 0)
    return total / this.viewerSamples.length
  }

  private changeViewers(delta: number): void {
    this.currentViewers = Math.max(0, this.currentViewers + delta)
    this.currentPeakViewers = Math.max(this.currentPeakViewers, this.currentViewers)
  }
}
