import type {
  GaugeKind,
  Intensity,
  PhenomenonKind,
  ShowDef,
  StaffRecovery,
  Tolerance,
  Weight,
} from './types'

// 시간
export const STEP_SECONDS = 1 / 60
/** 실제 방송 길이(실제 초). 극 중 길이와 무관하게 한 회는 실제 3분이다. */
export const BROADCAST_REAL_SECONDS = 180
export const BROADCAST_STEPS = Math.round(BROADCAST_REAL_SECONDS / STEP_SECONDS)
/** 코너는 극 중 방송 길이를 3등분한다(L1). 극 중 길이에 비례하므로 코너 길이를 극 중 시간으로 둔 것과 같다. */
export const CORNER_STEPS = BROADCAST_STEPS / 3
export const MAX_STEPS_PER_FRAME = 4
/**
 * 화면 루프가 한 프레임에 쓰는 실제 시간 상한(초). 탭을 백그라운드에 뒀다 돌아와도
 * 개입·광고 타이머가 한꺼번에 끝나지 않게 한다(게임 시간은 MAX_STEPS_PER_FRAME이 막는다).
 */
export const MAX_FRAME_REAL_SECONDS = 0.25
export const REACTION_COOLDOWN_SECONDS = 1

// 엔진
/** leap의 수직 속도 = speed × 이 비율 */
export const LEAP_VERTICAL_RATIO = 0.6
/** 이탈한 출연자가 출구로 걸어가는 수평 속도(m/s) */
export const WALKOUT_SPEED = 5
/** walk 이동이 목표에 도착했다고 보는 바닥 거리(m) */
export const WALK_ARRIVE_RADIUS = 0.3
/** walk 이동을 포기하는 시간(초). 막혀서 도착하지 못해도 계속 걷지 않게 한다. */
export const WALK_MAX_SECONDS = 6
/** onAirFrame 목표점: 송출 카메라가 보는 방향으로 사거리의 이 비율만큼 떨어진 바닥 */
export const ON_AIR_FRAME_DEPTH_RATIO = 0.5
/** 화난 포즈와 웃는 포즈가 새 행동 없이 유지되는 시간(초). 지나면 idle로 돌아온다. */
export const POSE_HOLD_SECONDS = 4
/** 이탈 뒤 물리 월드에서 빠지기까지 걸리는 시간 */
export const WALKOUT_SECONDS = 2
/** 이탈할 때 내뿜는 분노와 소음의 강도 */
export const WALKOUT_INTENSITY: Intensity = 2
/** 조명이 부서질 때 구역 중앙에 생기는 어둠의 강도 */
export const LIGHT_DARKNESS_INTENSITY: Intensity = 2
/** 출연자를 움직이게 한 원인(행동의 원인, 자신을 친 충격)이 다음 충돌로 이어지는 시간(초) */
export const MOTION_CAUSE_SECONDS = 2
/** 관객석이 송출되는 동안 관객이 흥분해 소음을 내는 주기(초) */
export const AUDIENCE_NOISE_SECONDS = 3
export const AUDIENCE_NOISE_INTENSITY: Intensity = 1
/** 관객이 시야 안의 웃음에 전염되어 내는 웃음의 강도 */
export const AUDIENCE_LAUGHTER_INTENSITY: Intensity = 1
/** BroadcastView.log에 담는 최근 줄 수 */
export const VIEW_LOG_LINES = 50

// 판단 정보(spec 8.2)
/** 현상 반응의 긴장도가 되돌아보는 시간(초) */
export const TENSION_WINDOW_SECONDS = 1
/** 긴장도가 이 값 이상이면 "곧 터짐!"을 붙인다. */
export const BURST_WARNING_TENSION = 0.75
/** 최근 현상으로 공간에 머무는 시간(초) */
export const PHENOMENON_DISPLAY_SECONDS = 1.5
/** 1초 전과 시청자 수 차이가 이 값(천 명) 이하면 추세 없음으로 본다. */
export const VIEWERS_TREND_EPSILON = 0.5

// 현상 전파
export const NOISE_RADIUS: Record<Intensity, number> = { 1: 3, 2: 6, 3: 12 }
/** 웃음과 노출이 보이는 반경(m) */
export const SIGHT_RADIUS = 6

/** 기척(강도 0) 소음 인지 반경(m). 소음 1의 3m보다 좁다. */
export const STIR_NOISE_RADIUS = 2
/** 기척(강도 0) 시야 인지 반경(m). 시야 6m보다 좁다. */
export const STIR_SIGHT_RADIUS = 4
/** 충격이 발생하는 상대 속도 하한(m/s) */
export const IMPACT_SPEED: Record<Intensity, number> = { 1: 3, 2: 6, 3: 9 }

// 물리
export const MASS_DENSITY: Record<Weight, number> = { light: 0.6, normal: 1, heavy: 1.8 }
export const CAPSULE = { halfHeight: 0.5, radius: 0.35 }
export const STAND_UP_SECONDS = 1.5
export const SETTLED_SPEED = 0.5
/** 일어설 때 다른 actor·장비와 띄우는 최소 간격(m) */
export const STAND_UP_CLEARANCE = 0.02
/** 일어설 빈자리를 좌우로 찾는 간격(m) */
export const STAND_UP_SEARCH_STEP = 0.05
export const GRAVITY = { x: 0, y: -9.81, z: 0 }
/** 스튜디오 크기(m). 바닥 y=0, 위가 +y. */
export const STUDIO_WIDTH = 16
export const STUDIO_HEIGHT = 9
/** 스튜디오 깊이(m). z 0~10. */
export const STUDIO_DEPTH = 10
/** 바닥·벽·천장 collider의 두께(m). 빠른 actor가 뚫지 않도록 넉넉히 둔다. */
export const BOUNDARY_THICKNESS = 1
export const ACTOR_FRICTION = 0.5
export const ACTOR_RESTITUTION = 0.1
export const FLOOR_FRICTION = 0.6
/** 매달린 조명 cuboid의 반 크기(m) */
export const LIGHT_HALF_EXTENTS = { hx: 0.4, hy: 0.2, hz: 0.4 }
export const LIGHT_DENSITY = 2
/** 세트 벽 cuboid의 반 크기(m). x 방향으로 길다. */
export const SET_WALL_HALF_EXTENTS = { hx: 1.5, hy: 1.5, hz: 0.1 }
export const SET_WALL_DENSITY = 3
/** 풀려난 세트 벽이 스튜디오 가운데 쪽으로 쓰러지기 시작하는 각속도(rad/s) */
export const SET_WALL_TOPPLE_ANGVEL = 1.2

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
/**
 * 정적 단계별 극 중 시간(극 중 초). 토크쇼(배율 10)의 실제 5/10/15초이며,
 * living spec 1.1의 "5초 넘게 아무 일도 없으면 정적"이라는 체감 목표에서 나왔다.
 */
export const SILENCE_SHOW_SECONDS: Record<Intensity, number> = { 1: 50, 2: 100, 3: 150 }

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
/** 스태프 자동 복구(spec 5.6): 반응한 상태를 holdSeconds 유지한 뒤 returnSeconds에 걸쳐 되돌린다. */
export const STAFF_RECOVERY: StaffRecovery = { holdSeconds: 1.5, returnSeconds: 2 }
export const MISFIRE_CAP = 0.6
/** 엇나감으로 올라갈 수 있는 emit 강도 상한 */
export const MISFIRE_MAX_INTENSITY = 3
/** overdo 엇나감이 move 속도에 곱하는 배율 */
export const OVERDO_SPEED_MULTIPLIER = 1.5
export const INTERVENTION_SPEED = 0.2
/** 개입 선택 시간(실제 초). 대상 카드를 읽고 고를 시간이다(spec 8.2). */
export const INTERVENTION_REAL_SECONDS = 10
export const AUTO_SLOWMO_REAL_SECONDS = 1.5
export const AUTO_SLOWMO_GAUGE_RATIO = 0.8

// 광고
/** 방송당 쓸 수 있는 광고 횟수 */
export const ADS_PER_BROADCAST = 1
export const AD_BREAK_REAL_SECONDS = 3
export const AD_VIEWER_LOSS = 0.1
export const AD_GAUGE_RELIEF = 25
export const AD_EFFECT_PICKS = 2
