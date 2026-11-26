import { describe, expect, it } from 'vitest'
import { RATING_LIMITS, VIEWERS_START, VIEWERS_TREND_EPSILON } from '@/content/balance'
import type { CameraDef, GaugeKind, ShowDef } from '@/content/types'
import { BroadcastScore, inFrame, viewersTrendOf } from './broadcast'
import type { PhenomenonEvent } from './phenomena'

const camera = (overrides: Partial<CameraDef> = {}): CameraDef => ({
  id: 'cam',
  label: '카메라',
  position: { x: 0, y: 0, z: 0 },
  defaultAngle: 0,
  fovDegrees: 60,
  range: 10,
  shotIntensity: 2,
  ...overrides,
})

const show = (rating: ShowDef['rating'] = 'TV-14') => ({ rating }) as ShowDef

let nextId = 0
const event = (overrides: Partial<PhenomenonEvent> = {}): PhenomenonEvent => ({
  id: nextId++,
  kind: 'laughter',
  intensity: 2,
  sourceId: 'rex',
  targetId: null,
  x: 0,
  y: 0,
  z: 0,
  step: 0,
  causeId: null,
  depth: 1,
  ...overrides,
})

describe('inFrame', () => {
  /** 바닥 평면(x, z) 위의 점. 높이는 판정에 쓰지 않는다. */
  const at = (x: number, z: number, y = 0) => ({ x, y, z })

  it('부채꼴 안은 true, 밖은 false', () => {
    expect(inFrame(camera(), 0, at(5, 0))).toBe(true)
    expect(inFrame(camera(), 0, at(5, 5))).toBe(false)
    expect(inFrame(camera(), 0, at(11, 0))).toBe(false)
  })

  it('카메라 위치를 기준으로 계산한다', () => {
    const cam = camera({ position: { x: 4, y: 3, z: 2 } })
    expect(inFrame(cam, 0, at(9, 2))).toBe(true)
    expect(inFrame(cam, 0, at(4, 7))).toBe(false)
  })

  it('각도와 거리 경계값을 포함한다', () => {
    expect(inFrame(camera(), 0, at(10, 0))).toBe(true)
    const edge = (30 * Math.PI) / 180
    expect(inFrame(camera(), 0, at(5 * Math.cos(edge), 5 * Math.sin(edge)))).toBe(true)
    expect(inFrame(camera(), 0, at(5 * Math.cos(edge), -5 * Math.sin(edge)))).toBe(true)
    const outside = (31 * Math.PI) / 180
    expect(inFrame(camera(), 0, at(5 * Math.cos(outside), 5 * Math.sin(outside)))).toBe(false)
  })

  it('z 방향 화각을 판정하고 높이는 보지 않는다', () => {
    const cam = camera({ fovDegrees: 40, range: 5 })
    expect(inFrame(cam, 90, { x: 0, y: 3, z: 4 })).toBe(true)
    expect(inFrame(cam, 90, { x: 3, y: 0, z: 1 })).toBe(false)
    expect(inFrame(cam, 90, at(0, -5))).toBe(false)
  })

  it('±180도 경계를 정규화한다', () => {
    const toward = (deg: number) =>
      at(5 * Math.cos((deg * Math.PI) / 180), 5 * Math.sin((deg * Math.PI) / 180))
    expect(inFrame(camera(), 170, toward(-175))).toBe(true)
    expect(inFrame(camera(), 170, toward(-155))).toBe(false)
  })
})

describe('BroadcastScore.scoreEvent', () => {
  it('깊이와 존재감을 반영해 점수와 시청자를 올린다', () => {
    const score = new BroadcastScore(show())
    const points = score.scoreEvent(event({ depth: 3, intensity: 2 }), 2, 1)
    expect(points).toBeCloseTo(7.5)
    expect(score.viewers).toBeCloseTo(VIEWERS_START + 30)
    expect(score.peakViewers).toBeCloseTo(VIEWERS_START + 30)
  })

  it('같은 (source, kind) 세 번째 송출의 novelty는 0.25다', () => {
    const score = new BroadcastScore(show())
    score.scoreEvent(event(), 1, 1)
    score.scoreEvent(event(), 1, 1)
    expect(score.scoreEvent(event(), 1, 1)).toBeCloseTo(3 * 0.25)
    expect(score.scoreEvent(event(), 1, 1)).toBeCloseTo(3 * 0.25)
  })

  it('source나 kind가 다르면 novelty를 따로 센다', () => {
    const score = new BroadcastScore(show())
    score.scoreEvent(event(), 1, 1)
    expect(score.scoreEvent(event({ sourceId: 'mia' }), 1, 1)).toBeCloseTo(3)
    expect(score.scoreEvent(event({ kind: 'anger' }), 1, 1)).toBeCloseTo(3)
  })

  it('gaze와 silence는 점수 0이다', () => {
    const score = new BroadcastScore(show())
    expect(score.scoreEvent(event({ kind: 'gaze' }), 1, 1)).toBe(0)
    expect(score.scoreEvent(event({ kind: 'silence' }), 1, 1)).toBe(0)
    expect(score.viewers).toBe(VIEWERS_START)
  })

  it('분노 강도 3은 language +10, violence +3', () => {
    const score = new BroadcastScore(show())
    score.scoreEvent(event({ kind: 'anger', intensity: 3 }), 1, 1)
    expect(score.gauges.language).toBe(10)
    expect(score.gauges.violence).toBe(3)
  })

  it('hitViolenceMultiplier는 impact 폭력성에만 곱한다', () => {
    const score = new BroadcastScore(show())
    score.scoreEvent(event({ kind: 'impact', intensity: 2 }), 1, 0.5)
    expect(score.gauges.violence).toBe(3)
    score.scoreEvent(event({ kind: 'anger', intensity: 1, sourceId: 'x' }), 1, 0.5)
    expect(score.gauges.violence).toBe(4)
  })
})

describe('BroadcastScore 게이지와 중단', () => {
  it('TV-14에서 동시에 넘으면 sexual이 먼저고, 이후에도 유지된다', () => {
    const score = new BroadcastScore(show('TV-14'))
    const limits = RATING_LIMITS['TV-14']
    score.addGauge('violence', limits.violence)
    score.addGauge('sexual', limits.sexual)
    expect(score.checkHalt()).toBe('sexual')
    expect(score.haltedBy).toBe('sexual')
    score.addGauge('language', limits.language)
    expect(score.checkHalt()).toBe('sexual')
  })

  it('상한 아래면 중단하지 않는다', () => {
    const score = new BroadcastScore(show('TV-14'))
    score.addGauge('violence', RATING_LIMITS['TV-14'].violence - 1)
    expect(score.checkHalt()).toBeNull()
    expect(score.haltedBy).toBeNull()
  })

  it('nearLimit은 상한의 80% 이상인 첫 게이지를 매번 계산한다', () => {
    const score = new BroadcastScore(show('TV-14'))
    expect(score.nearLimit()).toBeNull()
    score.addGauge('violence', 56)
    expect(score.nearLimit()).toBe('violence')
    score.relieveGauges(10)
    expect(score.nearLimit()).toBeNull()
  })

  it('nearLimitGauges는 상한의 80% 이상인 게이지를 정의 순서로 모두 돌려준다', () => {
    const score = new BroadcastScore(show('TV-14'))
    expect(score.nearLimitGauges()).toEqual([])
    score.addGauge('language', 40)
    score.addGauge('sexual', 56)
    expect(score.nearLimitGauges()).toEqual(['sexual', 'language'])
  })

  it('gauges로 받은 객체를 바꿔도 내부 게이지는 그대로다', () => {
    const score = new BroadcastScore(show())
    const received = score.gauges as Record<GaugeKind, number>
    received.violence = 50
    expect(score.gauges.violence).toBe(0)
  })

  it('relieveGauges는 0 미만으로 내리지 않는다', () => {
    const score = new BroadcastScore(show())
    score.addGauge('drugs', 5)
    score.relieveGauges(25)
    expect(score.gauges).toEqual({ sexual: 0, violence: 0, drugs: 0, language: 0 })
  })
})

describe('BroadcastScore 시청자', () => {
  it('tickSecond(2)는 viewers를 1% 줄이고 0이면 줄이지 않는다', () => {
    const score = new BroadcastScore(show())
    score.tickSecond(2)
    expect(score.viewers).toBeCloseTo(VIEWERS_START * 0.99)
    expect(score.peakViewers).toBe(VIEWERS_START)
    score.tickSecond(0)
    expect(score.viewers).toBeCloseTo(VIEWERS_START * 0.99)
  })

  it('applyAdLoss는 10%를 줄인다', () => {
    const score = new BroadcastScore(show())
    score.applyAdLoss()
    expect(score.viewers).toBeCloseTo(VIEWERS_START * 0.9)
  })

  it('averageViewers는 표본 평균이고 표본이 없으면 현재 viewers다', () => {
    const score = new BroadcastScore(show())
    expect(score.averageViewers()).toBe(VIEWERS_START)
    score.tickSecond(0)
    score.scoreEvent(event({ intensity: 3 }), 1, 1)
    score.tickSecond(0)
    expect(score.averageViewers()).toBeCloseTo((VIEWERS_START + (VIEWERS_START + 36)) / 2)
  })
})

describe('기척(강도 0)', () => {
  it('기척은 점수 0이고 시청자를 움직이지 않는다', () => {
    const score = new BroadcastScore(show())
    const viewersBefore = score.viewers
    expect(score.scoreEvent(event({ kind: 'laughter', intensity: 0 }), 1, 1)).toBe(0)
    expect(score.scoreEvent(event({ kind: 'noise', intensity: 0 }), 3, 1)).toBe(0)
    expect(score.viewers).toBe(viewersBefore)
    // 대조: 같은 사건이 강도 1이면 점수와 시청자가 움직인다
    expect(score.scoreEvent(event({ kind: 'laughter', intensity: 1 }), 1, 1)).toBeGreaterThan(0)
    expect(score.viewers).not.toBe(viewersBefore)
  })

  it('게이지 규칙이 있는 종류(exposure, anger)도 기척이면 게이지를 올리지 않는다', () => {
    const score = new BroadcastScore(show())
    const gaugesBefore = { ...score.gauges }
    expect(score.scoreEvent(event({ kind: 'exposure', intensity: 0 }), 1, 1)).toBe(0)
    expect(score.scoreEvent(event({ kind: 'anger', intensity: 0 }), 1, 1)).toBe(0)
    expect({ ...score.gauges }).toEqual(gaugesBefore)
    // 대조: 같은 종류의 강도 1은 게이지를 올린다
    score.scoreEvent(event({ kind: 'exposure', intensity: 1 }), 1, 1)
    score.scoreEvent(event({ kind: 'anger', intensity: 1 }), 1, 1)
    expect(score.gauges.sexual).toBeGreaterThan(gaugesBefore.sexual)
    expect(score.gauges.violence).toBeGreaterThan(gaugesBefore.violence)
  })
})

describe('viewersTrendOf', () => {
  it('차이가 VIEWERS_TREND_EPSILON 이하면 0, 넘으면 부호를 돌려준다', () => {
    expect(viewersTrendOf(500 + VIEWERS_TREND_EPSILON, 500)).toBe(0)
    expect(viewersTrendOf(500 - VIEWERS_TREND_EPSILON, 500)).toBe(0)
    expect(viewersTrendOf(500 + VIEWERS_TREND_EPSILON + 0.1, 500)).toBe(1)
    expect(viewersTrendOf(500 - VIEWERS_TREND_EPSILON - 0.1, 500)).toBe(-1)
  })
})
