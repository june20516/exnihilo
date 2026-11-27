import type { ActorView } from '@/sim/engineTypes'
import type { EmotionView } from '@/sim/life'
import type { Reason } from '@/sim/emotion'
import { actorProximity, emotionProximity, formatMoodShift, shiftSize, topReasons } from './emotionDisplay'

const ACTOR: ActorView = {
  id: 'rex',
  name: '렉스',
  x: 0,
  y: 0,
  z: 0,
  up: { x: 0, y: 1, z: 0 },
  pose: 'idle',
  onAir: true,
  walkedOut: false,
  departed: false,
  directivesLeft: 3,
  mood: null,
  emotions: [{ id: 'irritation', name: '짜증', value: 65, stage: 1, rise: [50, 80], reasons: [] }],
  misfireChance: 0,
  takeover: null,
  habit: null,
}

const nameOf = (id: string): string => id

function directive(amount: number, label: string): Reason {
  return { emotion: 'irritation', source: { type: 'directive', label }, amount }
}

function emotionWith(reasons: Reason[]): EmotionView {
  return { id: 'irritation', name: '짜증', value: 60, stage: 1, rise: [50, 80], reasons }
}

describe('emotionProximity', () => {
  it('문턱 아래는 0~50, 문턱 위는 50부터 1:1로 100까지 오른다', () => {
    expect(emotionProximity(0, [50, 80])).toBe(0)
    expect(emotionProximity(50, [50, 80])).toBe(50)
    expect(emotionProximity(65, [50, 80])).toBe(65)
    expect(emotionProximity(100, [50, 80])).toBe(100)
    expect(emotionProximity(30, [60, 90])).toBe(25)
    expect(emotionProximity(75, [60, 90])).toBe(65)
  })

  it('2단계 문턱 위는 80에서 100까지 늘어난다', () => {
    expect(emotionProximity(90, [60, 90])).toBe(80)
    expect(emotionProximity(95, [60, 90])).toBe(90)
    expect(emotionProximity(100, [60, 90])).toBe(100)
  })

  it('입력이 0~100 밖이면 자른다', () => {
    expect(emotionProximity(-5, [50, 80])).toBe(0)
    expect(emotionProximity(130, [50, 80])).toBe(100)
  })

  it('폭이 0 이하인 구간은 건너뛰고 NaN을 만들지 않는다', () => {
    expect(emotionProximity(0, [0, 80])).toBe(50)
    expect(emotionProximity(60, [70, 70])).toBeCloseTo(60 * (50 / 70))
    expect(emotionProximity(70, [80, 60])).toBeCloseTo(70 * (50 / 80))
    expect(emotionProximity(100, [50, 100])).toBe(100)
    expect(emotionProximity(40, [50, 100])).toBe(40)
  })
})

describe('actorProximity', () => {
  it('이탈했거나 감정이 없으면 null', () => {
    expect(actorProximity({ ...ACTOR, walkedOut: true })).toBeNull()
    expect(actorProximity({ ...ACTOR, emotions: [] })).toBeNull()
  })

  it('감정 중 가장 높은 근접도를 쓴다', () => {
    const calm: EmotionView = { id: 'fear', name: '불안', value: 10, stage: 0, rise: [50, 80], reasons: [] }
    expect(actorProximity({ ...ACTOR, emotions: [calm, ...ACTOR.emotions] })).toBe(65)
  })
})

describe('shiftSize', () => {
  it('경계 미만은 조금, 이상은 꽤, 큰 경계 이상은 크게', () => {
    expect([10, 15, 20, 25, 30, 50].map((a) => shiftSize(a, 20, 30))).toEqual(['조금', '조금', '꽤', '꽤', '크게', '크게'])
    expect(shiftSize(-40, 20, 30)).toBe('크게')
  })
})

describe('formatMoodShift', () => {
  it('내림은 ▼, 오름은 ▲', () => {
    expect(formatMoodShift({ emotion: 'irritation', amount: -40 }, '짜증')).toEqual({ text: '짜증 ▼ 크게', rising: false })
    expect(formatMoodShift({ emotion: 'irritation', amount: 10 }, '짜증')).toEqual({ text: '짜증 ▲ 조금', rising: true })
  })
})

describe('topReasons', () => {
  it('양수 이유만 큰 순으로 3개, 반올림 정수', () => {
    const reasons = [
      directive(8.6, 'a'),
      directive(-5, 'b'),
      directive(23.6, 'c'),
      directive(17.9, 'd'),
      directive(3, 'e'),
    ]
    const result = topReasons(emotionWith(reasons), nameOf)
    expect(result.map((r) => r.amount)).toEqual([24, 18, 9])
    expect(result[0].text).toBe("PD의 'c'")
  })

  it('relief만 있으면 빈 배열', () => {
    const relief: Reason = { emotion: 'irritation', source: { type: 'relief' }, amount: 30 }
    expect(topReasons(emotionWith([relief]), nameOf)).toEqual([])
  })
})
