import type { GaugeKind, Intensity, PhenomenonKind, ShowDef, Tolerance, Weight } from './types'

// 시간
export const STEP_SECONDS = 1 / 60
export const BROADCAST_STEPS = 10800
export const CORNER_STEPS = 3600
export const MAX_STEPS_PER_FRAME = 4
export const REACTION_COOLDOWN_SECONDS = 1

// 현상 전파
export const NOISE_RADIUS: Record<Intensity, number> = { 1: 3, 2: 6, 3: 12 }
/** 웃음과 노출이 보이는 반경(m) */
export const SIGHT_RADIUS = 6
/** 충격이 발생하는 상대 속도 하한(m/s) */
export const IMPACT_SPEED: Record<Intensity, number> = { 1: 3, 2: 6, 3: 9 }

// 물리
export const MASS_DENSITY: Record<Weight, number> = { light: 0.6, normal: 1, heavy: 1.8 }
export const CAPSULE = { halfHeight: 0.5, radius: 0.35 }
export const STAND_UP_SECONDS = 1.5
export const SETTLED_SPEED = 0.5

// 시청률
export const INTENSITY_POINTS: Record<Intensity, number> = { 1: 1, 2: 3, 3: 9 }
/** 같은 현상 반복 횟수별 신선도. 배열을 넘어서면 마지막 값을 유지한다. */
export const NOVELTY: readonly number[] = [1, 0.5, 0.25]
export const CHAIN_BONUS_PER_DEPTH = 0.5
export const PRESENCE_MULTIPLIER: Record<1 | 2 | 3, number> = { 1: 1, 2: 1.25, 3: 1.5 }
/** 천 명 */
export const VIEWERS_START = 500
export const VIEWERS_PER_POINT = 4
/** 침묵 단계별 초당 시청자 이탈 비율 */
export const SILENCE_LOSS_PER_SECOND: Record<Intensity, number> = { 1: 0.005, 2: 0.01, 3: 0.02 }
export const SILENCE_SECONDS: Record<Intensity, number> = { 1: 5, 2: 10, 3: 15 }

/**
 * 현상이 올리는 게이지 규칙. 증가량 = (perIntensity ?? 0) * 강도 + (flat ?? 0).
 * onlyAtIntensity가 있으면 그 강도일 때만 적용한다.
 */
export interface GaugeRiskRule {
  gauge: GaugeKind
  perIntensity?: number
  flat?: number
  onlyAtIntensity?: Intensity
}

export const GAUGE_RISK: Partial<Record<PhenomenonKind, readonly GaugeRiskRule[]>> = {
  impact: [{ gauge: 'violence', perIntensity: 3 }],
  anger: [
    { gauge: 'violence', perIntensity: 1 },
    { gauge: 'language', flat: 10, onlyAtIntensity: 3 },
  ],
  exposure: [{ gauge: 'sexual', perIntensity: 6 }],
}

/** 현상 하나가 각 게이지에 더하는 양. 해당 없는 게이지는 포함하지 않는다. */
export function gaugeRiskIncrease(
  kind: PhenomenonKind,
  intensity: Intensity,
): Partial<Record<GaugeKind, number>> {
  const increase: Partial<Record<GaugeKind, number>> = {}
  for (const rule of GAUGE_RISK[kind] ?? []) {
    if (rule.onlyAtIntensity !== undefined && rule.onlyAtIntensity !== intensity) continue
    const amount = (rule.perIntensity ?? 0) * intensity + (rule.flat ?? 0)
    increase[rule.gauge] = (increase[rule.gauge] ?? 0) + amount
  }
  return increase
}

export const RATING_LIMITS: Record<ShowDef['rating'], Record<GaugeKind, number>> = {
  'TV-PG': { sexual: 30, violence: 40, drugs: 20, language: 25 },
  'TV-14': { sexual: 70, violence: 70, drugs: 60, language: 50 },
  'TV-MA': { sexual: 100, violence: 100, drugs: 100, language: 100 },
}

// 개입
export const TOLERANCE_COUNT: Record<Tolerance, number> = { low: 2, normal: 3, high: 5, max: 8 }
export const FATIGUE_MISFIRE_PER_POINT = 0.1
export const STAFF_FATIGUE_MISFIRE_PER_POINT = 0.15
export const MISFIRE_CAP = 0.6
export const INTERVENTION_SPEED = 0.2
export const INTERVENTION_REAL_SECONDS = 4
export const AUTO_SLOWMO_REAL_SECONDS = 1.5
export const AUTO_SLOWMO_GAUGE_RATIO = 0.8

// 광고
export const AD_BREAK_REAL_SECONDS = 3
export const AD_VIEWER_LOSS = 0.1
export const AD_GAUGE_RELIEF = 25
export const AD_EFFECT_PICKS = 2
