import { describe, expect, it } from 'vitest'
import { STEP_SECONDS, VIEWERS_TREND_EPSILON } from '@/content/balance'
import type { PerformerDef, ReactionDef } from '@/content/types'
import type { CastMember } from './cast'
import type { PhenomenonEvent } from './phenomena'
import { CooldownTable, cooldownKey } from './reactions'
import { tensionOf, viewersTrendOf } from './tension'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)

function member(reactions: ReactionDef[], absentSteps = 0): CastMember {
  const def: PerformerDef = {
    id: 'rex',
    name: '렉스',
    shortName: '렉스',
    role: 'MC',
    tendency: '성향',
    presence: 1,
    tolerance: 'normal',
    weight: 'normal',
    tags: [],
    reactions,
    directives: [],
    misfire: 'never',
  }
  return {
    def,
    home: { x: 0, z: 0 },
    pose: 'idle',
    walkedOut: false,
    walkoutStep: null,
    departedAt: null,
    motionCause: null,
    motionCauseStep: 0,
    wasOnAir: false,
    absentSteps,
  }
}

const ABSENT_5S: ReactionDef = {
  trigger: { kind: 'gaze', when: 'absentFor', seconds: 5 },
  action: { pose: 'angry', emits: [] },
}
const ANGER_MIN_2: ReactionDef = {
  trigger: { kind: 'anger', min: 2, scope: 'perceived' },
  action: { pose: 'angry', emits: [] },
}

function anger(intensity: 1 | 2 | 3, step: number): PhenomenonEvent {
  return {
    id: step + 1,
    kind: 'anger',
    intensity,
    sourceId: 'other',
    targetId: null,
    x: 0,
    y: 0,
    z: 0,
    step,
    causeId: null,
    depth: 1,
  }
}

const perceivesAll = (): boolean => true

describe('tensionOf 시간 반응', () => {
  it('absentFor 5초 반응은 화면 밖 2.5초에 0.5, 270스텝에 0.9다', () => {
    const cooldowns = new CooldownTable()
    expect(tensionOf(member([ABSENT_5S], 150), [], cooldowns, 150, perceivesAll)).toBeCloseTo(0.5)
    expect(tensionOf(member([ABSENT_5S], 270), [], cooldowns, 270, perceivesAll)).toBeCloseTo(0.9)
  })

  it('쿨다운 중이면 화면 밖이어도 0이다', () => {
    const cooldowns = new CooldownTable()
    cooldowns.mark('rex', cooldownKey(ABSENT_5S.trigger), 140)
    expect(tensionOf(member([ABSENT_5S], 150), [], cooldowns, 150, perceivesAll)).toBe(0)
    expect(tensionOf(member([ABSENT_5S], 150), [], cooldowns, 200, perceivesAll)).toBeCloseTo(0.5)
  })

  it('발동 주기를 넘으면 진행도가 0부터 다시 찬다', () => {
    const tension = tensionOf(member([ABSENT_5S], 330), [], new CooldownTable(), 330, perceivesAll)
    expect(tension).toBeCloseTo(0.1)
  })

  it('화면 안에 있으면 0이다', () => {
    expect(tensionOf(member([ABSENT_5S], 0), [], new CooldownTable(), 0, perceivesAll)).toBe(0)
  })
})

describe('tensionOf 현상 반응', () => {
  const now = 100

  it('최소 강도 2 반응에 최근 강도 1 분노를 인지하면 0.5다', () => {
    const recent = [anger(1, now - 10)]
    const tension = tensionOf(member([ANGER_MIN_2]), recent, new CooldownTable(), now, perceivesAll)
    expect(tension).toBeCloseTo(0.5)
  })

  it('1초보다 오래된 이벤트와 인지하지 못한 이벤트는 세지 않는다', () => {
    const cooldowns = new CooldownTable()
    const old = anger(1, now - STEPS_PER_SECOND - 1)
    expect(tensionOf(member([ANGER_MIN_2]), [old], cooldowns, now, perceivesAll)).toBe(0)
    const fresh = [anger(1, now - 10)]
    expect(tensionOf(member([ANGER_MIN_2]), fresh, cooldowns, now, () => false)).toBe(0)
  })

  it('쿨다운 중인 반응의 진행도는 0이다', () => {
    const cooldowns = new CooldownTable()
    cooldowns.mark('rex', cooldownKey(ANGER_MIN_2.trigger), now - 5)
    const recent = [anger(1, now - 10)]
    expect(tensionOf(member([ANGER_MIN_2]), recent, cooldowns, now, perceivesAll)).toBe(0)
  })

  it('targetsSelf 반응은 자신을 향한 이벤트만 센다', () => {
    const reaction: ReactionDef = {
      trigger: { kind: 'anger', min: 2, scope: 'targetsSelf' },
      action: { pose: 'angry', emits: [] },
    }
    const aimedAtOther = { ...anger(1, now - 5), targetId: 'okafor' }
    const aimedAtSelf = { ...anger(1, now - 5), targetId: 'rex' }
    const cooldowns = new CooldownTable()
    expect(tensionOf(member([reaction]), [aimedAtOther], cooldowns, now, perceivesAll)).toBe(0)
    const tension = tensionOf(member([reaction]), [aimedAtSelf], cooldowns, now, perceivesAll)
    expect(tension).toBeCloseTo(0.5)
  })
})

describe('tensionOf 종합', () => {
  it('여러 반응 중 가장 큰 값을 쓰고 1을 넘지 않는다', () => {
    const cooldowns = new CooldownTable()
    const big = member([ABSENT_5S, ANGER_MIN_2], 270)
    expect(tensionOf(big, [anger(1, 99)], cooldowns, 100, perceivesAll)).toBeCloseTo(0.9)
    const over = member([ABSENT_5S], 299)
    expect(tensionOf(over, [], cooldowns, 100, perceivesAll)).toBeLessThanOrEqual(1)
  })

  it('이탈한 출연자는 0이다', () => {
    const gone = { ...member([ABSENT_5S], 270), walkedOut: true }
    expect(tensionOf(gone, [], new CooldownTable(), 0, perceivesAll)).toBe(0)
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
