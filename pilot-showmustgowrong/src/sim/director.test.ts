import { describe, expect, it } from 'vitest'
import type { ActionDef, PerformerDef, StaffDef } from '@/content/types'
import { createRng, type RngState } from '@/kit/rng'
import { FATIGUE_MISFIRE_PER_POINT, STAFF_FATIGUE_MISFIRE_PER_POINT } from '@/content/balance'
import { Director, type DirectiveOutcome } from './director'

const SHOUT: ActionDef = {
  pose: 'angry',
  move: { type: 'dash', toward: 'nearestPerformer', speed: 4 },
  emits: [
    { kind: 'anger', intensity: 2, target: 'none' },
    { kind: 'noise', intensity: 1, target: 'none' },
    { kind: 'laughter', intensity: 'causePlusOne', target: 'cause' },
  ],
}

function performer(
  id: string,
  tolerance: PerformerDef['tolerance'],
  misfire: PerformerDef['misfire'],
): PerformerDef {
  return {
    id,
    name: id,
    shortName: id,
    role: '역할',
    tendency: '성향',
    presence: 1,
    tolerance,
    weight: 'normal',
    tags: [],
    reactions: [],
    directives: [{ id: 'shout', label: '소리쳐', expect: '분노 2', action: SHOUT }],
    misfire,
  }
}

const STAFF: StaffDef[] = [
  {
    id: 'cam',
    name: 'cam',
    shortName: 'cam',
    cameraId: 'c1',
    reactions: [],
    directives: [{ id: 'audience', label: '관객', aim: 'audience' }],
  },
]

function makeDirector(): Director {
  return new Director(
    [
      performer('low', 'low', 'overdo'),
      performer('over', 'max', 'overdo'),
      performer('awk', 'max', 'awkward'),
      performer('never', 'max', 'never'),
    ],
    STAFF,
  )
}

/** 지시를 count번 내리고 마지막 결과와 rng를 돌려준다. */
function direct(director: Director, id: string, count: number, rng: RngState) {
  let outcome: DirectiveOutcome = { kind: 'walkout' }
  let current = rng
  for (let i = 0; i < count; i++) {
    ;[outcome, current] = director.directPerformer(id, 'shout', current)
  }
  return { outcome, rng: current }
}

// 이전 누적 피로 5(확률 0.5)에서 판정하는 여섯 번째 지시는 첫 지시가 rng를 쓰지 않으므로
// 다섯 번째 난수를 쓴다: seed 4는 0.23(엇나감), seed 1은 0.97(정상)
const MISFIRE_SEED = 4
const CLEAN_SEED = 1

describe('Director 출연자 지시', () => {
  it('내성 low는 세 번째 지시에서 이탈하고 이후 이탈 상태다', () => {
    const director = makeDirector()
    const { outcome } = direct(director, 'low', 3, createRng(1))
    expect(outcome).toEqual({ kind: 'walkout' })
    expect(director.isWalkedOut('low')).toBe(true)
    expect(director.directivesUsed('low')).toBe(3)
    expect(director.fatigue).toBe(3)
  })

  it('이탈 판정은 rng를 소비하지 않는다', () => {
    const director = makeDirector()
    const before = direct(director, 'low', 2, createRng(1)).rng
    const [, after] = director.directPerformer('low', 'shout', before)
    expect(after).toEqual(before)
  })

  it('fatigue 0의 첫 지시는 엇나가지 않고 rng도 소비하지 않는다', () => {
    const director = makeDirector()
    // seed 7 첫 난수 0.01은 확률이 있었다면 엇나갔을 값이다
    const rng = createRng(7)
    const [outcome, after] = director.directPerformer('over', 'shout', rng)
    expect(outcome).toEqual({ kind: 'executed', misfired: false, action: SHOUT })
    expect(after).toEqual(rng)
  })

  it('확률은 지시를 더하기 전 값으로 계산하고 rng를 정확히 한 번 소비한다', () => {
    const director = makeDirector()
    const [, afterFirst] = director.directPerformer('over', 'shout', createRng(7))
    // 이전 피로 1 -> 확률 0.1. seed 7 첫 난수 0.01 < 0.1이므로 엇나간다
    const [outcome, afterSecond] = director.directPerformer('over', 'shout', afterFirst)
    expect(outcome).toMatchObject({ kind: 'executed', misfired: true })
    expect(afterSecond.cursor).toBe(afterFirst.cursor + 1)
  })

  it('이미 이탈한 출연자에게 지시하면 오류를 던진다', () => {
    const director = makeDirector()
    direct(director, 'low', 3, createRng(1))
    expect(() => director.directPerformer('low', 'shout', createRng(1))).toThrow()
  })

  it('없는 출연자·지시·스태프 id는 오류를 던진다', () => {
    const director = makeDirector()
    expect(() => director.directPerformer('ghost', 'shout', createRng(1))).toThrow()
    expect(() => director.directPerformer('over', 'ghost', createRng(1))).toThrow()
    expect(() => director.directStaff('ghost', 'audience', createRng(1))).toThrow()
    expect(() => director.directStaff('cam', 'ghost', createRng(1))).toThrow()
    expect(() => director.directivesUsed('ghost')).toThrow()
    expect(() => director.isWalkedOut('ghost')).toThrow()
  })

  it('이전 누적 피로 5에서 overdo가 엇나가면 강도 +1(최대 3), 속도 x1.5이고 causePlusOne은 그대로다', () => {
    const director = makeDirector()
    const { outcome } = direct(director, 'over', 6, createRng(MISFIRE_SEED))
    expect(director.fatigue).toBe(6)
    expect(outcome).toEqual({
      kind: 'executed',
      misfired: true,
      action: {
        pose: 'angry',
        move: { type: 'dash', toward: 'nearestPerformer', speed: 6 },
        emits: [
          { kind: 'anger', intensity: 3, target: 'none' },
          { kind: 'noise', intensity: 2, target: 'none' },
          { kind: 'laughter', intensity: 'causePlusOne', target: 'cause' },
        ],
      },
    })
  })

  it('엇나가지 않는 시드에서는 원본 action을 그대로 돌려준다', () => {
    const director = makeDirector()
    const { outcome } = direct(director, 'over', 6, createRng(CLEAN_SEED))
    expect(outcome).toEqual({ kind: 'executed', misfired: false, action: SHOUT })
  })

  it('awkward가 엇나가면 강도 -1이고 0이 되는 emit은 제거된다', () => {
    const director = makeDirector()
    const { outcome } = direct(director, 'awk', 6, createRng(MISFIRE_SEED))
    expect(outcome).toMatchObject({ kind: 'executed', misfired: true })
    if (outcome.kind !== 'executed') return
    expect(outcome.action.emits).toEqual([
      { kind: 'anger', intensity: 1, target: 'none' },
      { kind: 'laughter', intensity: 'causePlusOne', target: 'cause' },
    ])
    expect(outcome.action.move).toEqual(SHOUT.move)
  })

  it('엇나감 변환은 원본 ActionDef를 바꾸지 않는다', () => {
    const snapshot = structuredClone(SHOUT)
    direct(makeDirector(), 'over', 6, createRng(MISFIRE_SEED))
    direct(makeDirector(), 'awk', 6, createRng(MISFIRE_SEED))
    expect(SHOUT).toEqual(snapshot)
  })

  it('never 출연자는 피로가 아무리 높아도 엇나가지 않고 rng를 소비하지 않는다', () => {
    const director = makeDirector()
    direct(director, 'over', 6, createRng(MISFIRE_SEED))
    direct(director, 'awk', 5, createRng(MISFIRE_SEED))
    const rng = createRng(MISFIRE_SEED)
    const [outcome, after] = director.directPerformer('never', 'shout', rng)
    expect(outcome).toEqual({ kind: 'executed', misfired: false, action: SHOUT })
    expect(after).toEqual(rng)
  })

  it('엇나감 확률은 MISFIRE_CAP(0.6)을 넘지 않는다', () => {
    const director = makeDirector()
    direct(director, 'over', 8, createRng(2))
    direct(director, 'awk', 2, createRng(2)) // 이전 피로 10 -> 계산상 1.0이지만 상한 0.6
    // seed 2 첫 난수 0.73은 상한 0.6 이상이라 정상. 상한이 없었다면 엇나갔을 값이다.
    const [outcome] = director.directPerformer('awk', 'shout', createRng(2))
    expect(outcome).toMatchObject({ kind: 'executed', misfired: false })
  })
})

describe('Director 스태프 지시', () => {
  it('첫 지시는 엇나가지 않고 aim을 그대로 돌려주며 staffFatigue만 올린다', () => {
    const director = makeDirector()
    const rng = createRng(7) // 첫 난수 0.01이어도 확률이 0이라 정상
    const [result, after] = director.directStaff('cam', 'audience', rng)
    expect(result).toEqual({ aim: 'audience', misfired: false })
    expect(after).toEqual(rng)
    expect(director.staffFatigue).toBe(1)
    expect(director.fatigue).toBe(0)
    expect(director.directivesUsed('low')).toBe(0)
  })

  it('이전 staffFatigue 1이면 확률 0.15로 판정하고 엇나가면 aim이 random이다', () => {
    const director = makeDirector()
    director.directStaff('cam', 'audience', createRng(1))
    const [result, rng] = director.directStaff('cam', 'audience', createRng(7))
    expect(result).toEqual({ aim: 'random', misfired: true })
    expect(rng.cursor).toBe(1)
  })

  it('이전 staffFatigue 2는 확률 0.3이다', () => {
    const director = makeDirector()
    director.directStaff('cam', 'audience', createRng(1))
    director.directStaff('cam', 'audience', createRng(1))
    // seed 2 두 번째 난수 0.32는 정상, seed 1 두 번째 난수 0.00은 엇나감
    const [clean] = director.directStaff('cam', 'audience', { seed: 2, cursor: 1 })
    expect(clean.misfired).toBe(false)
    const again = makeDirector()
    again.directStaff('cam', 'audience', createRng(1))
    again.directStaff('cam', 'audience', createRng(1))
    const [bad] = again.directStaff('cam', 'audience', { seed: 1, cursor: 1 })
    expect(bad.misfired).toBe(true)
  })

  it('엇나감 확률은 MISFIRE_CAP(0.6)을 넘지 않는다', () => {
    const director = makeDirector()
    for (let i = 0; i < 5; i++) director.directStaff('cam', 'audience', createRng(1))
    // 이전 staffFatigue 5 -> 계산상 0.75지만 상한 0.6. seed 2 첫 난수 0.73은 정상이다.
    const [result] = director.directStaff('cam', 'audience', createRng(2))
    expect(result.misfired).toBe(false)
  })
})

describe('Director 광고와 피로', () => {
  it('takeAd는 처음 true, 두 번째 false이고 adsLeft가 줄어든다', () => {
    const director = makeDirector()
    expect(director.adsLeft).toBe(1)
    expect(director.takeAd()).toBe(true)
    expect(director.takeAd()).toBe(false)
    expect(director.adsLeft).toBe(0)
  })

  it('resetFatigue는 fatigue만 0으로 되돌린다', () => {
    const director = makeDirector()
    direct(director, 'over', 3, createRng(1))
    director.directStaff('cam', 'audience', createRng(1))
    expect(director.fatigue).toBe(3)
    director.resetFatigue()
    expect(director.fatigue).toBe(0)
    expect(director.staffFatigue).toBe(1)
    expect(director.directivesUsed('over')).toBe(3)
  })
})

describe('Director 엇나감 미리보기', () => {
  it('피로 0이면 0, 개입 2번 뒤에는 2 × FATIGUE_MISFIRE_PER_POINT다', () => {
    const director = makeDirector()
    expect(director.previewMisfireChance('over')).toBe(0)
    direct(director, 'over', 2, createRng(1))
    expect(director.previewMisfireChance('over')).toBeCloseTo(2 * FATIGUE_MISFIRE_PER_POINT)
  })

  it('misfire never 출연자는 피로와 상관없이 0이다', () => {
    const director = makeDirector()
    direct(director, 'over', 3, createRng(1))
    expect(director.previewMisfireChance('never')).toBe(0)
  })

  it('스태프 미리보기는 스태프 피로로 계산한다', () => {
    const director = makeDirector()
    expect(director.previewStaffMisfireChance('cam')).toBe(0)
    director.directStaff('cam', 'audience', createRng(1))
    expect(director.previewStaffMisfireChance('cam')).toBeCloseTo(STAFF_FATIGUE_MISFIRE_PER_POINT)
  })

  it('없는 id는 오류를 던진다', () => {
    const director = makeDirector()
    expect(() => director.previewMisfireChance('ghost')).toThrow()
    expect(() => director.previewStaffMisfireChance('ghost')).toThrow()
  })

  it('미리보기는 상태를 바꾸지 않아 다음 지시 결과가 같다', () => {
    const previewed = makeDirector()
    const plain = makeDirector()
    direct(previewed, 'over', 4, createRng(3))
    direct(plain, 'over', 4, createRng(3))
    previewed.previewMisfireChance('over')
    previewed.previewStaffMisfireChance('cam')
    const rng = createRng(MISFIRE_SEED)
    expect(previewed.directPerformer('over', 'shout', rng)).toEqual(
      plain.directPerformer('over', 'shout', rng),
    )
    expect(previewed.fatigue).toBe(plain.fatigue)
  })
})
