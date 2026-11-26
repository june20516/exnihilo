import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateTunables, violatedConstraints } from '@/kit/tuning/tuning'
import * as balance from './balance'
import { COMMON_SENSITIVITIES } from './commonMind'
import { JUNE_MIND } from './minds/june'
import { MO_MIND } from './minds/mo'
import { OKAFOR_MIND } from './minds/okafor'
import { PRIYA_MIND } from './minds/priya'
import { REX_MIND } from './minds/rex'
import { TUNABLES, TUNING_CONSTRAINTS, scaledRange, tuned } from './tuning'
import type { MindDef, SensitivityDef, Situation } from './types'
import { isValidThresholds } from './validate'

/** balance.ts 상수 이름과 같은 키(brief 표). 값이 숫자 하나인 상수만 */
const BALANCE_KEYS = [
  'BROADCAST_REAL_SECONDS',
  'SITUATION_REFERENCE_PER_SHOW_MINUTE',
  'SITUATION_FADE_PER_SHOW_MINUTE',
  'SITUATION_CAP',
  'EVENT_REASON_SHOW_SECONDS',
  'RELIEF_AMOUNT',
  'RELIEF_SHOW_SECONDS',
  'SMALL_BURST_KEEP',
  'SMALL_BURST_MTB_SHOW_SECONDS',
  'SMALL_BURST_COOLDOWN_SHOW_SECONDS',
  'BIG_BURST_GRACE_BODY_SECONDS',
  'BIG_BURST_MTB_BODY_SECONDS',
  'STAGE_LINE_COOLDOWN_SHOW_SECONDS',
  'HABIT_BOREDOM_SHORTEN',
  'HABIT_COOLDOWN_SHOW_SECONDS',
  'HABIT_REST_AFTER_ACTION_BODY_SECONDS',
  'RESPONSE_COOLDOWN_SHOW_SECONDS',
  'RECALL_SHOW_SECONDS',
  'LOG_NUDGE_BODY_SECONDS',
  'NEAR_RADIUS',
  'MOTION_CAUSE_SECONDS',
  'REACTION_COOLDOWN_SECONDS',
  'CHAIN_BONUS_PER_DEPTH',
  'VIEWERS_START',
  'VIEWERS_PER_POINT',
  'INTERVENTION_SPEED',
  'INTERVENTION_REAL_SECONDS',
  'AUTO_SLOWMO_REAL_SECONDS',
  'AUTO_SLOWMO_GAUGE_RATIO',
  'FATIGUE_MISFIRE_PER_POINT',
  'STAFF_FATIGUE_MISFIRE_PER_POINT',
  'MISFIRE_CAP',
  'OVERDO_MULTIPLIER',
  'AD_BREAK_REAL_SECONDS',
  'AD_VIEWER_LOSS',
] as const

/** balance 상수가 아닌 키(감정 문턱, 묶음 값, 다음 task가 쓸 새 항목, 출연자 속도) */
const OTHER_KEYS = [
  'threshold.rise1',
  'threshold.rise2',
  'threshold.fall1',
  'threshold.fall2',
  'threshold.intense',
  'HABIT_INTERVAL_SHOW_SECONDS',
  'TAKEOVER_BODY_SECONDS',
  'AUTO_SHOT_BODY_SECONDS',
  'AUTO_MIN_HOLD_BODY_SECONDS',
] as const

type SituationKind = Situation['kind']
type RateField = 'perShowMinute' | 'fadePerShowMinute'

/** [키, mind의 민감도 목록, 감정, 상황 종류, 필드] */
const MIND_KEYS: [string, readonly SensitivityDef[], string, SituationKind, RateField][] = [
  ['mind.common.boredom.silence.perShowMinute', COMMON_SENSITIVITIES, 'boredom', 'silence', 'perShowMinute'],
  ['mind.rex.attention.offScreen.perShowMinute', REX_MIND.sensitivities, 'attention', 'offScreen', 'perShowMinute'],
  ['mind.rex.attention.offScreen.fadePerShowMinute', REX_MIND.sensitivities, 'attention', 'offScreen', 'fadePerShowMinute'],
  ['mind.rex.boredom.silence.perShowMinute', REX_MIND.sensitivities, 'boredom', 'silence', 'perShowMinute'],
  ['mind.priya.boredom.silence.perShowMinute', PRIYA_MIND.sensitivities, 'boredom', 'silence', 'perShowMinute'],
  ['mind.okafor.boredom.silence.perShowMinute', OKAFOR_MIND.sensitivities, 'boredom', 'silence', 'perShowMinute'],
  ['mind.mo.excitement.studioAudience.perShowMinute', MO_MIND.sensitivities, 'excitement', 'showTrait', 'perShowMinute'],
  ['mind.june.chatter.silence.perShowMinute', JUNE_MIND.sensitivities, 'chatter', 'silence', 'perShowMinute'],
  ['mind.june.chatter.silence.fadePerShowMinute', JUNE_MIND.sensitivities, 'chatter', 'silence', 'fadePerShowMinute'],
  ['mind.june.anxiety.nearTag.perShowMinute', JUNE_MIND.sensitivities, 'anxiety', 'nearTag', 'perShowMinute'],
  ['mind.june.boredom.silence.perShowMinute', JUNE_MIND.sensitivities, 'boredom', 'silence', 'perShowMinute'],
]

/** 0이면 고장 나는 항목(tuning.ts 머리 주석의 규칙) */
const POSITIVE_KEYS: readonly string[] = [
  'BROADCAST_REAL_SECONDS',
  'INTERVENTION_SPEED',
  'SMALL_BURST_MTB_SHOW_SECONDS',
  'BIG_BURST_MTB_BODY_SECONDS',
  'HABIT_INTERVAL_SHOW_SECONDS',
  'LOG_NUDGE_BODY_SECONDS',
  'AUTO_SHOT_BODY_SECONDS',
  'EVENT_REASON_SHOW_SECONDS',
  'RELIEF_SHOW_SECONDS',
  'INTERVENTION_REAL_SECONDS',
  'AD_BREAK_REAL_SECONDS',
  // 콘텐츠 검증이 0을 거부한다
  ...MIND_KEYS.map(([key]) => key),
]

function situationRate(
  sensitivities: readonly SensitivityDef[],
  emotion: string,
  kind: SituationKind,
  field: RateField,
): number | undefined {
  const found = sensitivities.find(
    (entry) => entry.on === 'situation' && entry.emotion === emotion && entry.situation.kind === kind,
  )
  return found?.on === 'situation' ? found[field] : undefined
}

describe('게임 조정 목록', () => {
  it('정의 오류가 없다', () => {
    expect(validateTunables(TUNABLES)).toEqual([])
  })

  it('표의 모든 키가 조정 목록에 있다', () => {
    const keys = TUNABLES.map((def) => def.key)
    for (const key of [...BALANCE_KEYS, ...OTHER_KEYS, ...MIND_KEYS.map(([key]) => key)]) {
      expect(keys).toContain(key)
    }
    expect(keys).toHaveLength(BALANCE_KEYS.length + OTHER_KEYS.length + MIND_KEYS.length)
  })

  it('모든 항목이 묶음, 이름, 단위, 설명을 갖는다', () => {
    for (const def of TUNABLES) {
      expect(def.group, def.key).not.toBe('')
      expect(def.label, def.key).not.toBe('')
      expect(def.unit, def.key).not.toBe('')
      expect(def.description, def.key).not.toBe('')
    }
  })

  it('balance.ts의 상수는 같은 키의 조정값이다', () => {
    const values: Record<string, unknown> = balance
    for (const key of BALANCE_KEYS) expect(values[key], key).toBe(tuned(key))
  })

  it('감정 문턱과 버릇 간격은 조정값에서 만든다', () => {
    expect(balance.DEFAULT_THRESHOLDS).toEqual({
      rise: [tuned('threshold.rise1'), tuned('threshold.rise2')],
      fall: [tuned('threshold.fall1'), tuned('threshold.fall2')],
      intense: tuned('threshold.intense'),
    })
    expect(balance.HABIT_INTERVAL_SHOW_SECONDS).toEqual({
      min: tuned('HABIT_INTERVAL_SHOW_SECONDS'),
      max: 2 * tuned('HABIT_INTERVAL_SHOW_SECONDS'),
    })
  })

  it('기본값은 옮기기 전 값 그대로다', () => {
    expect(balance.DEFAULT_THRESHOLDS).toEqual({ rise: [50, 80], fall: [40, 70], intense: 100 })
    expect(balance.HABIT_INTERVAL_SHOW_SECONDS).toEqual({ min: 100, max: 200 })
    expect(balance.SMALL_BURST_MTB_SHOW_SECONDS).toBe(50)
    expect(balance.RELIEF_AMOUNT).toBe(-40)
    expect(tuned('TAKEOVER_BODY_SECONDS')).toBe(5)
    expect(tuned('AUTO_MIN_HOLD_BODY_SECONDS')).toBe(1.5)
  })

  it('Plan B1 Task 8이 자동 PD 무입력 검증에 맞춰 바꾼 기본값(근거는 tuning.ts와 작업 로그)', () => {
    expect(tuned('AUTO_SHOT_BODY_SECONDS')).toBe(8) // 5에서
    expect(balance.SITUATION_FADE_PER_SHOW_MINUTE).toBe(3.5) // 4에서
    expect(balance.HABIT_BOREDOM_SHORTEN).toBe(0.55) // 0.4에서
    expect(tuned('mind.rex.attention.offScreen.perShowMinute')).toBe(12) // 7에서
    expect(tuned('mind.rex.attention.offScreen.fadePerShowMinute')).toBe(15) // 40에서
  })

  it('출연자 감정 속도는 같은 키의 조정값이다', () => {
    for (const [key, sensitivities, emotion, kind, field] of MIND_KEYS) {
      expect(situationRate(sensitivities, emotion, kind, field), key).toBe(tuned(key))
    }
  })

  it('공용 정적 지루함을 덮지 않은 출연자(모)는 공용 속도를 쓴다', () => {
    const mind: MindDef = MO_MIND
    expect(situationRate(mind.sensitivities, 'boredom', 'silence', 'perShowMinute')).toBe(
      tuned('mind.common.boredom.silence.perShowMinute'),
    )
  })

  it('0이면 고장 나는 항목은 하한이 간격 한 칸이고, 나머지는 0(음수 기본값이면 기본값×4)이다', () => {
    for (const def of TUNABLES) {
      if (POSITIVE_KEYS.includes(def.key)) expect(def.min, def.key).toBe(def.step)
      else expect(def.min, def.key).toBe(Math.min(0, def.defaultValue * 4))
    }
  })

  it('기본값이 0이면 범위를 직접 적으라고 throw한다', () => {
    expect(() => scaledRange('ZERO', 0)).toThrow('기본값이 0인 항목은 range를 직접 적어야 합니다: ZERO')
  })

  it('기본값은 모든 관계를 지킨다', () => {
    const defaults = Object.fromEntries(TUNABLES.map((def) => [def.key, def.defaultValue]))
    expect(violatedConstraints(defaults, TUNING_CONSTRAINTS)).toEqual([])
  })

  it.each([
    ['기본값', {}, true],
    ['내림 문턱 0', { 'threshold.fall1': 0 }, false],
    ['1단계 내림 = 진입', { 'threshold.fall1': 50 }, false],
    ['2단계 내림 > 진입', { 'threshold.fall2': 85 }, false],
    ['1단계 진입 >= 2단계 진입', { 'threshold.rise1': 80, 'threshold.fall2': 79 }, false],
    ['1단계 내림 >= 2단계 내림', { 'threshold.fall1': 45, 'threshold.rise1': 70, 'threshold.fall2': 45 }, false],
    ['2단계 진입 > 참다 터짐', { 'threshold.intense': 79 }, false],
    ['2단계 진입 = 참다 터짐', { 'threshold.intense': 80 }, true],
  ])('문턱 관계는 콘텐츠 문턱 검증과 같다: %s', (_name, changes: Record<string, number>, valid) => {
    const defaults = Object.fromEntries(TUNABLES.map((def) => [def.key, def.defaultValue]))
    const values = { ...defaults, ...changes }
    expect(violatedConstraints(values, TUNING_CONSTRAINTS).length === 0).toBe(valid)
    const thresholds = {
      rise: [values['threshold.rise1'], values['threshold.rise2']] as [number, number],
      fall: [values['threshold.fall1'], values['threshold.fall2']] as [number, number],
      intense: values['threshold.intense'],
    }
    expect(isValidThresholds(thresholds)).toBe(valid)
  })

  const shotSeconds = tuned('AUTO_SHOT_BODY_SECONDS')
  it.each([
    ['최소 유지 = 컷 길이', { AUTO_MIN_HOLD_BODY_SECONDS: shotSeconds }, true],
    ['최소 유지 > 컷 길이', { AUTO_MIN_HOLD_BODY_SECONDS: shotSeconds + 0.5 }, false],
    ['컷 길이를 최소 유지 아래로', { AUTO_SHOT_BODY_SECONDS: 1 }, false],
  ])('자동 PD 관계: %s', (_name, changes: Record<string, number>, valid) => {
    const defaults = Object.fromEntries(TUNABLES.map((def) => [def.key, def.defaultValue]))
    expect(violatedConstraints({ ...defaults, ...changes }, TUNING_CONSTRAINTS).length === 0).toBe(valid)
  })

  it('모르는 키를 물으면 throw한다', () => {
    expect(() => tuned('없는키')).toThrow('없는키')
  })
})

describe('조정값 로드 순서', () => {
  afterEach(() => {
    delete globalThis.__EXNIHILO_TUNING__
    vi.resetModules()
  })

  it('모듈을 불러오기 전에 둔 조정값으로 balance 상수를 만든다', async () => {
    vi.resetModules()
    globalThis.__EXNIHILO_TUNING__ = { SMALL_BURST_MTB_SHOW_SECONDS: 60 }
    const fresh = await import('@/content/balance')
    const { TUNING } = await import('@/content/tuning')
    expect(fresh.SMALL_BURST_MTB_SHOW_SECONDS).toBe(60)
    expect(TUNING.values.SMALL_BURST_MTB_SHOW_SECONDS).toBe(60)
    expect(TUNING.rejected).toEqual([])
  })

  it('범위 밖 조정값은 버리고 기본값을 쓴다', async () => {
    vi.resetModules()
    globalThis.__EXNIHILO_TUNING__ = { SMALL_BURST_MTB_SHOW_SECONDS: 99999 }
    const fresh = await import('@/content/balance')
    const { TUNING } = await import('@/content/tuning')
    expect(fresh.SMALL_BURST_MTB_SHOW_SECONDS).toBe(50)
    expect(TUNING.rejected).toHaveLength(1)
    expect(TUNING.rejected[0]).toMatchObject({ key: 'SMALL_BURST_MTB_SHOW_SECONDS', reason: 'outOfRange' })
  })

  it('조정 mind 속도도 불러올 때의 조정값을 쓴다', async () => {
    vi.resetModules()
    // 기본값(12)과 다른 값이어야 조정값이 실제로 쓰였는지 가릴 수 있다
    globalThis.__EXNIHILO_TUNING__ = { 'mind.rex.attention.offScreen.perShowMinute': 20 }
    const { REX_MIND: freshRex } = await import('@/content/minds/rex')
    expect(situationRate(freshRex.sensitivities, 'attention', 'offScreen', 'perShowMinute')).toBe(20)
  })
})

/** 값 안의 모든 수가 유한한지(NaN·Infinity가 없는지). 어긋난 첫 경로를 돌려준다 */
function firstNonFinitePath(value: unknown, path = '', seen = new Set<object>()): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path} = ${value}`
  if (typeof value !== 'object' || value === null || seen.has(value)) return null
  seen.add(value)
  for (const [key, child] of Object.entries(value)) {
    const found = firstNonFinitePath(child, `${path}.${key}`, seen)
    if (found !== null) return found
  }
  return null
}

describe('조정값 극단', () => {
  afterEach(() => {
    delete globalThis.__EXNIHILO_TUNING__
    vi.resetModules()
  })

  it('관계를 어긴 저장값은 기본값으로 되돌리고 conflict로 남기며 방송은 시작한다', async () => {
    vi.resetModules()
    globalThis.__EXNIHILO_TUNING__ = { 'threshold.fall1': 60 }
    const { TUNING } = await import('@/content/tuning')
    const fresh = await import('@/content/balance')
    expect(fresh.DEFAULT_THRESHOLDS).toEqual({ rise: [50, 80], fall: [40, 70], intense: 100 })
    expect(TUNING.rejected).toEqual([
      expect.objectContaining({ key: 'threshold.fall1', value: 60, reason: 'conflict' }),
    ])
    const { Broadcast } = await import('@/sim/engine')
    const { LINEUP } = await import('@/content/lineup')
    const { TALK_SHOW } = await import('@/content/talkShow')
    const broadcast = await Broadcast.create({ show: TALK_SHOW, ...LINEUP, seed: 1 })
    broadcast.dispose()
  })

  it('모든 항목을 최솟값으로 둬도 방송이 끝까지 돌고 NaN·Infinity·throw가 없다', async () => {
    vi.resetModules()
    globalThis.__EXNIHILO_TUNING__ = Object.fromEntries(TUNABLES.map((def) => [def.key, def.min]))
    const { TUNING } = await import('@/content/tuning')
    // 문턱은 모두 0이면 관계를 어겨 기본값으로 돌아간다. 그 밖에는 버려진 값이 없다
    expect(TUNING.rejected.every((item) => item.reason === 'conflict' && item.key.startsWith('threshold.'))).toBe(true)
    const { Broadcast } = await import('@/sim/engine')
    const { LINEUP } = await import('@/content/lineup')
    const { TALK_SHOW } = await import('@/content/talkShow')
    const broadcast = await Broadcast.create({ show: TALK_SHOW, ...LINEUP, seed: 1 })
    try {
      let steps = 0
      while (broadcast.phase === 'live') {
        broadcast.step([])
        steps += 1
        if (steps % 60 === 0) expect(firstNonFinitePath(broadcast.view())).toBeNull()
      }
      expect(steps).toBeGreaterThan(0)
      expect(firstNonFinitePath(broadcast.view())).toBeNull()
      expect(firstNonFinitePath(broadcast.summary())).toBeNull()
    } finally {
      broadcast.dispose()
    }
  })
})
