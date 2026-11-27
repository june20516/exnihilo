import type { BroadcastView } from '@/sim/engineTypes'
import { actorProximity } from './emotionDisplay'

export interface TrendSeries {
  actorId: string
  points: { step: number; value: number | null }[]
}

/** 출연자별 근접도를 일정 간격으로 기록한다. 이탈한 출연자의 값은 null */
export class TrendRecorder {
  private readonly series: TrendSeries[]
  private readonly sampleEverySteps: number
  private lastSampleIndex = -1

  constructor(actorIds: readonly string[], sampleEverySteps = 30) {
    this.sampleEverySteps = sampleEverySteps
    this.series = actorIds.map((actorId) => ({ actorId, points: [] }))
  }

  /** 같은 표본 구간에서 여러 번 불려도 점은 하나. 구간을 건너뛰면 건너뛴 칸을 지금 값으로 채운다 */
  record(view: BroadcastView): void {
    const sampleIndex = Math.floor(view.step / this.sampleEverySteps)
    if (sampleIndex <= this.lastSampleIndex) return
    for (const { actorId, points } of this.series) {
      const actor = view.actors.find((candidate) => candidate.id === actorId)
      const value = actor === undefined ? null : actorProximity(actor)
      for (let index = this.lastSampleIndex + 1; index <= sampleIndex; index++) {
        points.push({ step: index * this.sampleEverySteps, value })
      }
    }
    this.lastSampleIndex = sampleIndex
  }

  /** endStep - windowSteps 이상, endStep 이하의 점만 */
  window(endStep: number, windowSteps: number): TrendSeries[] {
    return this.series.map(({ actorId, points }) => ({
      actorId,
      points: points.filter((point) => point.step >= endStep - windowSteps && point.step <= endStep),
    }))
  }

  all(): TrendSeries[] {
    return this.series.map(({ actorId, points }) => ({ actorId, points: [...points] }))
  }
}
