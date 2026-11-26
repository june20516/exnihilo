import { describe, expect, it } from 'vitest'
import {
  EVENT_REASON_SHOW_SECONDS,
  SITUATION_CAP,
  SITUATION_FADE_PER_SHOW_MINUTE,
  SITUATION_REFERENCE_PER_SHOW_MINUTE,
  SMALL_BURST_KEEP,
} from '@/content/balance'
import { COMMON_EMOTION_DEFS } from '@/content/emotions'
import { TALK_SHOW } from '@/content/talkShow'
import type { EventIntensity, MindDef, SensitivityDef } from '@/content/types'
import { showSecondsToSteps, showTimeScale } from './showClock'
import { Mind, type ActiveSituations } from './emotion'
import type { PhenomenonEvent } from './phenomena'

const STEPS_PER_SECOND = 60
const LABEL = { noun: '무시', clause: '한참 화면에 안 잡힌' }
const OFF_SCREEN: SensitivityDef = {
  emotion: 'irritation',
  on: 'situation',
  situation: { kind: 'offScreen' },
  perShowMinute: SITUATION_REFERENCE_PER_SHOW_MINUTE,
  label: LABEL,
}
const NOISE_SENSITIVITY: SensitivityDef = {
  emotion: 'irritation',
  on: 'event',
  kind: 'noise',
  scope: 'perceived',
  amount: 10,
}
const IDLE: ActiveSituations = {
  onAir: true,
  silence: false,
  nearTags: [],
  showTraits: [],
}
const OFF_AIR: ActiveSituations = { ...IDLE, onAir: false }

function makeMind(overrides: Partial<MindDef> = {}, step = 0): Mind {
  const def: MindDef = {
    emotions: [...COMMON_EMOTION_DEFS],
    sensitivities: [],
    bursts: {},
    habits: [],
    ...overrides,
  }
  return new Mind(def, TALK_SHOW, step)
}

function makeEvent(
  overrides: Partial<PhenomenonEvent> = {},
  intensity: EventIntensity = 1,
): PhenomenonEvent {
  return {
    id: 1,
    kind: 'noise',
    intensity,
    sourceId: 'mo',
    targetId: null,
    x: 0,
    y: 0,
    z: 0,
    step: 0,
    causeId: null,
    depth: 1,
    ...overrides,
  }
}

/** 공개 API(지시 이유)로 현재 값을 target에 맞춘다. 이름이 겹치지 않게 label을 새로 쓴다. */
let directiveCount = 0
function setValue(mind: Mind, target: number, step: number): void {
  directiveCount += 1
  const delta = target - mind.value('irritation')
  mind.addDirective(
    [{ emotion: 'irritation', amount: delta }],
    `맞춤${directiveCount}`,
    step,
  )
}

describe('체감 목표(living spec 1.1)', () => {
  // 기준 상황(offScreen, SITUATION_REFERENCE_PER_SHOW_MINUTE)이 계속 참이면
  function measure(): { toStage1: number; toStage2: number } {
    const mind = makeMind({ sensitivities: [OFF_SCREEN] })
    let toStage1 = -1
    let toStage2 = -1
    for (let step = 30; step <= 200 * STEPS_PER_SECOND; step += 30) {
      mind.advance(OFF_AIR, step)
      const seconds = step / STEPS_PER_SECOND
      if (toStage1 < 0 && mind.stage('irritation') >= 1) toStage1 = seconds
      if (toStage2 < 0 && mind.stage('irritation') >= 2) toStage2 = seconds
    }
    return { toStage1, toStage2 }
  }

  it('평온에서 1단계까지 실제 40~60초', () => {
    const { toStage1 } = measure()
    expect(toStage1).toBeGreaterThanOrEqual(40)
    expect(toStage1).toBeLessThanOrEqual(60)
  })

  it('1단계에서 2단계까지 실제 20~40초', () => {
    const { toStage1, toStage2 } = measure()
    expect(toStage2 - toStage1).toBeGreaterThanOrEqual(20)
    expect(toStage2 - toStage1).toBeLessThanOrEqual(40)
  })
})

describe('사건 이유', () => {
  it('사건 이유는 실제 18초 동안 선형으로 줄어 사라진다', () => {
    const mind = makeMind({ sensitivities: [NOISE_SENSITIVITY] })
    mind.perceive(makeEvent(), false, 0)
    expect(mind.value('irritation')).toBeCloseTo(10)
    mind.advance(IDLE, 9 * STEPS_PER_SECOND)
    expect(mind.value('irritation')).toBeCloseTo(5)
    mind.advance(IDLE, 18 * STEPS_PER_SECOND)
    expect(mind.value('irritation')).toBe(0)
    expect(mind.topReasons('irritation', 5)).toEqual([])
  })

  it('같은 사람의 같은 종류 사건이 겹치면 1, 0.6, 0.35, 0.2배로 쌓인다', () => {
    const mind = makeMind({ sensitivities: [NOISE_SENSITIVITY] })
    for (let id = 1; id <= 5; id += 1) {
      mind.perceive(makeEvent({ id }), false, 0)
    }
    const amounts = mind.topReasons('irritation', 10).map((r) => r.amount)
    expect(amounts[0]).toBeCloseTo(10)
    expect(amounts[1]).toBeCloseTo(6)
    expect(amounts[2]).toBeCloseTo(3.5)
    expect(amounts[3]).toBeCloseTo(2)
    expect(amounts[4]).toBeCloseTo(2)

    mind.perceive(makeEvent({ id: 6, sourceId: 'jun' }), false, 0)
    const other = mind
      .topReasons('irritation', 10)
      .filter((r) => r.source.type === 'event' && r.source.event.sourceId === 'jun')
    expect(other[0].amount).toBeCloseTo(10)
  })

  it('같은 사건이 같은 감정의 민감도 둘에 맞아도 서로 반복으로 세지 않는다', () => {
    const mind = makeMind({
      sensitivities: [
        NOISE_SENSITIVITY,
        { ...NOISE_SENSITIVITY, amount: 20 },
      ],
    })
    mind.perceive(makeEvent(), false, 0)
    expect(mind.topReasons('irritation', 5).map((r) => r.amount)).toEqual([
      20, 10,
    ])
  })

  it('지시 이유는 같은 label이 겹치면 반복 배율을 받고 사건 이유와 같은 수명으로 줄어든다', () => {
    const mind = makeMind()
    const shift = [{ emotion: 'irritation', amount: 10 }]
    mind.addDirective(shift, '재촉', 0)
    mind.addDirective(shift, '재촉', 0)
    mind.addDirective(shift, '달램', 0)
    expect(mind.topReasons('irritation', 5).map((r) => r.amount)).toEqual([
      10, 10, 6,
    ])
    mind.advance(IDLE, showSecondsToSteps(EVENT_REASON_SHOW_SECONDS / 2, TALK_SHOW))
    expect(mind.value('irritation')).toBeCloseTo(13)
    mind.advance(IDLE, showSecondsToSteps(EVENT_REASON_SHOW_SECONDS, TALK_SHOW))
    expect(mind.topReasons('irritation', 5)).toEqual([])
  })

  it('기척 사건은 강도 1의 0.4배다', () => {
    const mind = makeMind({ sensitivities: [NOISE_SENSITIVITY] })
    mind.perceive(makeEvent({}, 0), false, 0)
    expect(mind.value('irritation')).toBeCloseTo(4)
  })

  it('scope targetsSelf 민감도는 나를 향한 사건에만 맞는다', () => {
    const mind = makeMind({
      sensitivities: [{ ...NOISE_SENSITIVITY, scope: 'targetsSelf' }],
    })
    mind.perceive(makeEvent(), false, 0)
    expect(mind.value('irritation')).toBe(0)
    mind.perceive(makeEvent(), true, 0)
    expect(mind.value('irritation')).toBeCloseTo(10)
  })
})

describe('상황 이유', () => {
  const SHOW_MINUTES_PER_REAL_SECOND = showTimeScale(TALK_SHOW) / 60
  /** 10초(실제) 동안 offScreen이면 극 중 100초가 지난 만큼 쌓인다 */
  const ACCUMULATED =
    SITUATION_REFERENCE_PER_SHOW_MINUTE * 10 * SHOW_MINUTES_PER_REAL_SECOND
  function accumulate(mind: Mind): void {
    for (let step = 30; step <= 10 * STEPS_PER_SECOND; step += 30) {
      mind.advance(OFF_AIR, step)
    }
  }

  it('상황이 끝나면 SITUATION_FADE 속도로 빠지고 0이 되면 이유가 사라진다', () => {
    const mind = makeMind({ sensitivities: [OFF_SCREEN] })
    accumulate(mind)
    expect(mind.value('irritation')).toBeCloseTo(ACCUMULATED)
    mind.advance(IDLE, 600 + 150)
    // 실제 2.5초 동안 FADE 속도로 빠진다
    expect(mind.value('irritation')).toBeCloseTo(
      ACCUMULATED - SITUATION_FADE_PER_SHOW_MINUTE * 2.5 * SHOW_MINUTES_PER_REAL_SECOND,
    )
    const fadeRealSeconds =
      ACCUMULATED / (SITUATION_FADE_PER_SHOW_MINUTE * SHOW_MINUTES_PER_REAL_SECOND)
    mind.advance(IDLE, 600 + Math.ceil(fadeRealSeconds * STEPS_PER_SECOND) + 30)
    expect(mind.value('irritation')).toBe(0)
    expect(mind.topReasons('irritation', 5)).toEqual([])
  })

  it('fadePerShowMinute가 있으면 그 속도로 빠진다', () => {
    const mind = makeMind({
      sensitivities: [{ ...OFF_SCREEN, fadePerShowMinute: 3 }],
    })
    accumulate(mind)
    mind.advance(IDLE, 600 + 150)
    // 실제 2.5초 = 극 중 25초 = 0.4167분 x 3 = 1.25
    expect(mind.value('irritation')).toBeCloseTo(
      ACCUMULATED - 3 * 2.5 * SHOW_MINUTES_PER_REAL_SECOND,
    )
  })

  it('nearTag present:false는 그 태그가 근처에 없을 때만 쌓인다', () => {
    const sensitivity: SensitivityDef = {
      ...OFF_SCREEN,
      situation: { kind: 'nearTag', tag: 'host', present: false },
    }
    const near = makeMind({ sensitivities: [sensitivity] })
    const alone = makeMind({ sensitivities: [sensitivity] })
    for (let step = 30; step <= 600; step += 30) {
      near.advance({ ...IDLE, nearTags: ['host'] }, step)
      alone.advance(IDLE, step)
    }
    expect(near.value('irritation')).toBe(0)
    expect(alone.value('irritation')).toBeCloseTo(ACCUMULATED)
  })

  it.each([
    ['onScreen', { kind: 'onScreen' }, IDLE, OFF_AIR],
    ['silence', { kind: 'silence' }, { ...IDLE, silence: true }, IDLE],
    [
      'showTrait',
      { kind: 'showTrait', trait: 'live' },
      { ...IDLE, showTraits: ['live'] },
      IDLE,
    ],
  ] as const)('%s 상황은 조건이 참일 때만 쌓인다', (_name, situation, on, off) => {
    const sensitivity: SensitivityDef = { ...OFF_SCREEN, situation }
    const active = makeMind({ sensitivities: [sensitivity] })
    const inactive = makeMind({ sensitivities: [sensitivity] })
    for (let step = 30; step <= 600; step += 30) {
      active.advance(on, step)
      inactive.advance(off, step)
    }
    expect(active.value('irritation')).toBeCloseTo(ACCUMULATED)
    expect(inactive.value('irritation')).toBe(0)
  })

  it('nearTag present:true는 그 태그가 근처에 있을 때만 쌓인다', () => {
    const sensitivity: SensitivityDef = {
      ...OFF_SCREEN,
      situation: { kind: 'nearTag', tag: 'host', present: true },
    }
    const near = makeMind({ sensitivities: [sensitivity] })
    const alone = makeMind({ sensitivities: [sensitivity] })
    for (let step = 30; step <= 600; step += 30) {
      near.advance({ ...IDLE, nearTags: ['host'] }, step)
      alone.advance(IDLE, step)
    }
    expect(near.value('irritation')).toBeCloseTo(ACCUMULATED)
    expect(alone.value('irritation')).toBe(0)
  })

  it('상황 누적은 SITUATION_CAP에서 멈춘다', () => {
    const mind = makeMind({
      sensitivities: [{ ...OFF_SCREEN, perShowMinute: 1000 }],
    })
    mind.advance(OFF_AIR, 600)
    mind.advance(OFF_AIR, 1200)
    expect(mind.topReasons('irritation', 1)[0].amount).toBe(SITUATION_CAP)
  })

  it('같은 (감정, 키) 민감도가 둘이면 첫 번째만 쓴다', () => {
    const mind = makeMind({
      sensitivities: [
        OFF_SCREEN,
        { ...OFF_SCREEN, perShowMinute: 1000, label: { noun: 'x', clause: 'y' } },
      ],
    })
    for (let step = 30; step <= 600; step += 30) mind.advance(OFF_AIR, step)
    expect(mind.topReasons('irritation', 5)).toHaveLength(1)
    expect(mind.value('irritation')).toBeCloseTo(ACCUMULATED)
  })

  it('끝난 상황의 아주 작은 잔량은 지운다', () => {
    const mind = makeMind({ sensitivities: [OFF_SCREEN] })
    mind.advance(OFF_AIR, 1)
    // 남은 양보다 조금 덜 빠지는 시간: 잔량이 epsilon 이하이면 이유가 사라진다
    const remaining = mind.value('irritation')
    const fadeSteps = (remaining / SITUATION_FADE_PER_SHOW_MINUTE) * 6 * 60
    mind.advance(IDLE, 1 + fadeSteps * (1 - 1e-12))
    expect(mind.topReasons('irritation', 1)).toEqual([])
  })

  it('경과 스텝이 거꾸로 들어와도 상황이 줄거나 늘지 않는다', () => {
    const mind = makeMind({ sensitivities: [OFF_SCREEN] })
    mind.advance(OFF_AIR, 600)
    const before = mind.value('irritation')
    mind.advance(OFF_AIR, 300)
    expect(mind.value('irritation')).toBe(before)
    // 이미 처리한 구간(300~600)을 다시 쌓지 않는다
    mind.advance(OFF_AIR, 630)
    const gain =
      SITUATION_REFERENCE_PER_SHOW_MINUTE * 0.5 * SHOW_MINUTES_PER_REAL_SECOND
    expect(mind.value('irritation')).toBeCloseTo(before + gain)
  })
})

describe('단계(히스테리시스)', () => {
  it('1단계에서 값이 42와 48을 오가면 1단계를 유지하고 단계 변화가 없다', () => {
    const mind = makeMind()
    setValue(mind, 55, 0)
    expect(mind.advance(IDLE, 0)).toEqual([
      { emotion: 'irritation', from: 0, to: 1 },
    ])
    for (const value of [42, 48, 42, 48]) {
      setValue(mind, value, 0)
      expect(mind.advance(IDLE, 0)).toEqual([])
      expect(mind.stage('irritation')).toBe(1)
    }
  })

  it('0단계에서 값이 41과 49를 오가면 오르지 않고, 1단계에서 39가 되면 내려간다', () => {
    const mind = makeMind()
    for (const value of [41, 49, 41, 49]) {
      setValue(mind, value, 0)
      expect(mind.advance(IDLE, 0)).toEqual([])
      expect(mind.stage('irritation')).toBe(0)
    }
    setValue(mind, 50, 0)
    mind.advance(IDLE, 0)
    expect(mind.stage('irritation')).toBe(1)
    setValue(mind, 39, 0)
    expect(mind.advance(IDLE, 0)).toEqual([
      { emotion: 'irritation', from: 1, to: 0 },
    ])
  })

  it('2단계 진입 스텝을 기록하고, 75와 71을 오가면 유지하며 69가 되면 1단계로 내려가 null이 된다', () => {
    const mind = makeMind()
    expect(mind.stage2Since('irritation')).toBeNull()
    setValue(mind, 85, 100)
    mind.advance(IDLE, 100)
    expect(mind.stage('irritation')).toBe(2)
    expect(mind.stage2Since('irritation')).toBe(100)
    for (const value of [75, 71, 75, 71]) {
      setValue(mind, value, 100)
      mind.advance(IDLE, 100)
      expect(mind.stage('irritation')).toBe(2)
      expect(mind.stage2Since('irritation')).toBe(100)
    }
    setValue(mind, 69, 100)
    expect(mind.advance(IDLE, 100)).toEqual([
      { emotion: 'irritation', from: 2, to: 1 },
    ])
    expect(mind.stage2Since('irritation')).toBeNull()
  })

  it('0에서 2로, 2에서 0으로 바로 갈 수 있다', () => {
    const mind = makeMind()
    setValue(mind, 90, 0)
    expect(mind.advance(IDLE, 0)).toEqual([
      { emotion: 'irritation', from: 0, to: 2 },
    ])
    setValue(mind, 10, 0)
    expect(mind.advance(IDLE, 0)).toEqual([
      { emotion: 'irritation', from: 2, to: 0 },
    ])
  })
})

describe('터짐 뒤처리', () => {
  it('relieveSmall은 양수 이유를 SMALL_BURST_KEEP배로, catharsis는 양수 이유를 지우고 -40 후련함을 붙인다', () => {
    const small = makeMind()
    small.addDirective([{ emotion: 'irritation', amount: 55 }], '참기', 0)
    small.relieveSmall('irritation')
    expect(small.value('irritation')).toBeCloseTo(55 * SMALL_BURST_KEEP)

    const big = makeMind({ baseline: { irritation: 50 } })
    big.addDirective([{ emotion: 'irritation', amount: 20 }], '참기', 0)
    expect(big.value('irritation')).toBeCloseTo(70)
    big.catharsis('irritation', 0)
    expect(big.topReasons('irritation', 5)).toEqual([])
    expect(big.value('irritation')).toBeCloseTo(10)
    // 후련함은 실제 60초에 걸쳐 0으로 줄어든다(30초 뒤 절반)
    big.advance(IDLE, 30 * STEPS_PER_SECOND)
    expect(big.value('irritation')).toBeCloseTo(30)
    big.advance(IDLE, 60 * STEPS_PER_SECOND)
    expect(big.value('irritation')).toBeCloseTo(50)
  })

  it('topReasons는 기여가 큰 순서이고 음수(후련함)는 빼고 출처를 기억한다', () => {
    const mind = makeMind({ sensitivities: [NOISE_SENSITIVITY] })
    mind.addDirective([{ emotion: 'irritation', amount: 10 }], 'a', 0)
    mind.addDirective([{ emotion: 'irritation', amount: 30 }], 'b', 0)
    mind.addDirective([{ emotion: 'irritation', amount: 10 }], 'c', 0)
    mind.perceive(makeEvent({ id: 7 }), false, 0)
    mind.addDirective([{ emotion: 'irritation', amount: -5 }], 'd', 0)
    mind.catharsis('boredom', 0)

    const top = mind.topReasons('irritation', 10)
    expect(top.map((r) => r.amount)).toEqual([30, 10, 10, 10])
    expect(top[0].source).toEqual({ type: 'directive', label: 'b' })
    // 같은 크기는 먼저 생긴 순서
    expect(top[1].source).toEqual({ type: 'directive', label: 'a' })
    expect(top[2].source).toEqual({ type: 'directive', label: 'c' })
    expect(top[3].source.type).toBe('event')
    expect(mind.topReasons('irritation', 2)).toHaveLength(2)
    expect(mind.topReasons('boredom', 5)).toEqual([])
  })

  it('reset은 이유와 단계를 모두 지운다', () => {
    const mind = makeMind({ baseline: { irritation: 5 } })
    setValue(mind, 90, 0)
    mind.advance(IDLE, 0)
    expect(mind.stage('irritation')).toBe(2)
    mind.reset(10)
    expect(mind.stage('irritation')).toBe(0)
    expect(mind.stage2Since('irritation')).toBeNull()
    expect(mind.topReasons('irritation', 5)).toEqual([])
    expect(mind.value('irritation')).toBe(5)
  })
})

describe('정의 덮어쓰기', () => {
  it('baseline과 문턱 덮어쓰기를 쓴다', () => {
    const mind = makeMind({
      baseline: { irritation: 25, boredom: 30 },
      thresholds: {
        irritation: { rise: [20, 60], fall: [10, 50], intense: 90 },
      },
    })
    expect(mind.value('boredom')).toBe(30)
    expect(mind.advance(IDLE, 0)).toEqual([
      { emotion: 'irritation', from: 0, to: 1 },
    ])
    expect(mind.stage('boredom')).toBe(0)
  })

  it('감정 값은 0~100으로 묶인다', () => {
    const mind = makeMind()
    mind.addDirective([{ emotion: 'irritation', amount: 150 }], 'x', 0)
    expect(mind.value('irritation')).toBe(100)
    mind.addDirective([{ emotion: 'irritation', amount: -400 }], 'y', 0)
    expect(mind.value('irritation')).toBe(0)
  })
})
