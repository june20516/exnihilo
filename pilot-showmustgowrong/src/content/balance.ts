import type {
  EmotionThresholds,
  EventIntensity,
  GaugeKind,
  Intensity,
  PhenomenonKind,
  ShowDef,
  StaffRecovery,
  Tolerance,
  Weight,
} from './types'
import { tuned } from './tuning'

// tuned('키')로 만드는 상수는 플레이 감각 수치다. 값·범위·근거는 tuning.ts에 있다(값은 페이지를 불러올 때 한 번 풀린다).

// 시간
export const STEP_SECONDS = 1 / 60
export const BROADCAST_REAL_SECONDS = tuned('BROADCAST_REAL_SECONDS')
export const BROADCAST_STEPS = Math.round(BROADCAST_REAL_SECONDS / STEP_SECONDS)
/** 코너는 극 중 방송 길이를 3등분한다(L1). 극 중 길이에 비례하므로 코너 길이를 극 중 시간으로 둔 것과 같다. */
export const CORNER_STEPS = BROADCAST_STEPS / 3
export const MAX_STEPS_PER_FRAME = 4
/**
 * 화면 루프가 한 프레임에 쓰는 실제 시간 상한(초). 탭을 백그라운드에 뒀다 돌아와도
 * 개입·광고 타이머가 한꺼번에 끝나지 않게 한다(게임 시간은 MAX_STEPS_PER_FRAME이 막는다).
 */
export const MAX_FRAME_REAL_SECONDS = 0.25
export const REACTION_COOLDOWN_SECONDS = tuned('REACTION_COOLDOWN_SECONDS')

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
export const MOTION_CAUSE_SECONDS = tuned('MOTION_CAUSE_SECONDS')
/** 출연자 지시가 그 출연자의 마지막 연루 사고를 이어받는 몸 초. 0이면 이어받지 않는다 */
export const TAKEOVER_BODY_SECONDS = tuned('TAKEOVER_BODY_SECONDS')
/** 자동 PD가 평소 한 컷을 잡는 몸 초 */
export const AUTO_SHOT_BODY_SECONDS = tuned('AUTO_SHOT_BODY_SECONDS')
/** 자동 PD가 다른 출연자의 사고로 컷을 옮기기 전에 지금 컷을 잡는 최소 몸 초 */
export const AUTO_MIN_HOLD_BODY_SECONDS = tuned('AUTO_MIN_HOLD_BODY_SECONDS')
/** 관객석이 송출되는 동안 관객이 흥분해 소음을 내는 주기(초) */
export const AUDIENCE_NOISE_SECONDS = 3
export const AUDIENCE_NOISE_INTENSITY: Intensity = 1
/** 관객이 시야 안의 웃음에 전염되어 내는 웃음의 강도 */
export const AUDIENCE_LAUGHTER_INTENSITY: Intensity = 1
/** BroadcastView.log에 담는 최근 줄 수 */
export const VIEW_LOG_LINES = 50

// 판단 정보(spec 8.2)
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
export const CHAIN_BONUS_PER_DEPTH = tuned('CHAIN_BONUS_PER_DEPTH')
export const PRESENCE_MULTIPLIER: Record<1 | 2 | 3, number> = { 1: 1, 2: 1.25, 3: 1.5 }
export const VIEWERS_START = tuned('VIEWERS_START')
export const VIEWERS_PER_POINT = tuned('VIEWERS_PER_POINT')
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
export const FATIGUE_MISFIRE_PER_POINT = tuned('FATIGUE_MISFIRE_PER_POINT')
export const STAFF_FATIGUE_MISFIRE_PER_POINT = tuned('STAFF_FATIGUE_MISFIRE_PER_POINT')
/** 스태프 자동 복구(spec 5.6): 반응한 상태를 holdSeconds 유지한 뒤 returnSeconds에 걸쳐 되돌린다. */
export const STAFF_RECOVERY: StaffRecovery = { holdSeconds: 1.5, returnSeconds: 2 }
export const MISFIRE_CAP = tuned('MISFIRE_CAP')
/** 엇나감으로 올라갈 수 있는 emit 강도 상한 */
export const MISFIRE_MAX_INTENSITY = 3
export const OVERDO_MULTIPLIER = tuned('OVERDO_MULTIPLIER')
export const INTERVENTION_SPEED = tuned('INTERVENTION_SPEED')
export const INTERVENTION_REAL_SECONDS = tuned('INTERVENTION_REAL_SECONDS')
export const AUTO_SLOWMO_REAL_SECONDS = tuned('AUTO_SLOWMO_REAL_SECONDS')
export const AUTO_SLOWMO_GAUGE_RATIO = tuned('AUTO_SLOWMO_GAUGE_RATIO')

// 광고
/** 방송당 쓸 수 있는 광고 횟수 */
export const ADS_PER_BROADCAST = 1
export const AD_BREAK_REAL_SECONDS = tuned('AD_BREAK_REAL_SECONDS')
export const AD_VIEWER_LOSS = tuned('AD_VIEWER_LOSS')
export const AD_GAUGE_RELIEF = 25
export const AD_EFFECT_PICKS = 2

// 감정(값은 tuning.ts)
export const DEFAULT_THRESHOLDS: EmotionThresholds = {
  rise: [tuned('threshold.rise1'), tuned('threshold.rise2')],
  fall: [tuned('threshold.fall1'), tuned('threshold.fall2')],
  intense: tuned('threshold.intense'),
}
export const SITUATION_REFERENCE_PER_SHOW_MINUTE = tuned('SITUATION_REFERENCE_PER_SHOW_MINUTE')
export const SITUATION_FADE_PER_SHOW_MINUTE = tuned('SITUATION_FADE_PER_SHOW_MINUTE')
export const SITUATION_CAP = tuned('SITUATION_CAP')
export const EVENT_REASON_SHOW_SECONDS = tuned('EVENT_REASON_SHOW_SECONDS')
/** 사건 강도별 감정 배율. 기척(강도 0)은 강도 1의 0.4배다. */
export const INTENSITY_EMOTION_FACTOR: Record<EventIntensity, number> = {
  0: 0.4,
  1: 1,
  2: 2,
  3: 3,
}
/** 같은 이유가 살아 있는 개수별 배율(림월드식 중첩). 개수가 넘으면 마지막 값을 쓴다. */
export const REPEAT_MULTIPLIERS: readonly number[] = [1, 0.6, 0.35, 0.2]
export const SMALL_BURST_KEEP = tuned('SMALL_BURST_KEEP')
export const RELIEF_AMOUNT = tuned('RELIEF_AMOUNT')
export const RELIEF_SHOW_SECONDS = tuned('RELIEF_SHOW_SECONDS')

// 스튜디오 생활(living spec 1.1, 3.3: 터짐, 버릇, 응답, 재촉)
/** 터짐 확률을 판정하는 주기(몸 초). 감정 틱이 이 간격으로 돈다. */
export const LIFE_TICK_BODY_SECONDS = 0.5
export const SMALL_BURST_MTB_SHOW_SECONDS = tuned('SMALL_BURST_MTB_SHOW_SECONDS')
export const SMALL_BURST_COOLDOWN_SHOW_SECONDS = tuned('SMALL_BURST_COOLDOWN_SHOW_SECONDS')
export const BIG_BURST_GRACE_BODY_SECONDS = tuned('BIG_BURST_GRACE_BODY_SECONDS')
export const BIG_BURST_MTB_BODY_SECONDS = tuned('BIG_BURST_MTB_BODY_SECONDS')
export const STAGE_LINE_COOLDOWN_SHOW_SECONDS = tuned('STAGE_LINE_COOLDOWN_SHOW_SECONDS')
export const NEAR_RADIUS = tuned('NEAR_RADIUS')
/** 버릇 간격(극 중 초). 긴 쪽은 짧은 쪽의 2배다. */
export const HABIT_INTERVAL_SHOW_SECONDS = {
  min: tuned('HABIT_INTERVAL_SHOW_SECONDS'),
  max: 2 * tuned('HABIT_INTERVAL_SHOW_SECONDS'),
} as const
export const HABIT_BOREDOM_SHORTEN = tuned('HABIT_BOREDOM_SHORTEN')
export const HABIT_COOLDOWN_SHOW_SECONDS = tuned('HABIT_COOLDOWN_SHOW_SECONDS')
export const HABIT_REST_AFTER_ACTION_BODY_SECONDS = tuned('HABIT_REST_AFTER_ACTION_BODY_SECONDS')
export const RESPONSE_COOLDOWN_SHOW_SECONDS = tuned('RESPONSE_COOLDOWN_SHOW_SECONDS')
export const LOG_NUDGE_BODY_SECONDS = tuned('LOG_NUDGE_BODY_SECONDS')
export const RECALL_SHOW_SECONDS = tuned('RECALL_SHOW_SECONDS')
/** 터짐 출력과 감정 보기에 담는 이유의 최대 개수 */
export const LIFE_TOP_REASON_COUNT = 3
/** 감정·버릇 난수를 기존 난수와 분리하는 salt('life'의 ASCII). */
export const LIFE_RNG_SALT = 0x6c696665
/**
 * intense 큰 터짐(값이 intense 문턱 이상)에서 이 강도인 행동 emit이 INTENSE_EMIT_INTENSITY로 올라간다.
 * 한 단계 위로 올려 "참다 터진" 큰 터짐이 보통 큰 터짐보다 확실히 크게 번지게 한다(living spec 1.1의 intense 구분).
 */
export const INTENSE_SOURCE_INTENSITY: Intensity = 2
export const INTENSE_EMIT_INTENSITY: Intensity = 3
