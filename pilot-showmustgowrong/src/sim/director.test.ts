import { describe, expect, it } from 'vitest'
import type { ActionDef, PerformerDef, StaffDef } from '@/content/types'
import { createRng, type RngState } from '@/kit/rng'
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
    presence: 1,
    tolerance,
    weight: 'normal',
    tags: [],
    reactions: [],
    directives: [{ id: 'shout', label: '소리쳐', action: SHOUT }],
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

// seed별 다섯 번째 난수: 4와 5는 0.5 미만(엇나감), 1은 0.5 이상(정상)
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

  it('fatigue 1에서는 확률이 있어 rng를 한 번 소비하고, 이탈 전 지시는 이탈이 아니다', () => {
    const director = makeDirector()
    const [outcome, rng] = director.directPerformer('over', 'shout', createRng(1))
    expect(outcome.kind).toBe('executed')
    expect(rng.cursor).toBe(1)
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

  it('fatigue 5에서 overdo가 엇나가면 강도 +1(최대 3), 속도 x1.5이고 causePlusOne은 그대로다', () => {
    const director = makeDirector()
    const { outcome } = direct(director, 'over', 5, createRng(MISFIRE_SEED))
    expect(director.fatigue).toBe(5)
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
    const { outcome } = direct(director, 'over', 5, createRng(CLEAN_SEED))
    expect(outcome).toEqual({ kind: 'executed', misfired: false, action: SHOUT })
  })

  it('awkward가 엇나가면 강도 -1이고 0이 되는 emit은 제거된다', () => {
    const director = makeDirector()
    const { outcome } = direct(director, 'awk', 5, createRng(MISFIRE_SEED))
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
    direct(makeDirector(), 'over', 5, createRng(MISFIRE_SEED))
    direct(makeDirector(), 'awk', 5, createRng(MISFIRE_SEED))
    expect(SHOUT).toEqual(snapshot)
  })

  it('never 출연자는 fatigue 10에서도 엇나가지 않고 rng를 소비하지 않는다', () => {
    const director = makeDirector()
    direct(director, 'over', 5, createRng(MISFIRE_SEED))
    direct(director, 'awk', 4, createRng(MISFIRE_SEED))
    const rng = createRng(MISFIRE_SEED)
    const [outcome, after] = director.directPerformer('never', 'shout', rng)
    expect(director.fatigue).toBe(10)
    expect(outcome).toEqual({ kind: 'executed', misfired: false, action: SHOUT })
    expect(after).toEqual(rng)
  })

  it('엇나감 확률은 MISFIRE_CAP(0.6)을 넘지 않는다', () => {
    // fatigue 10이면 계산상 1.0이지만 상한 0.6이 적용된다. 난수 0.73(seed 2 첫 값)은 정상이어야 한다.
    const director = makeDirector()
    direct(director, 'over', 8, createRng(2)) // fatigue 8
    direct(director, 'awk', 1, createRng(2)) // fatigue 9
    const [outcome] = director.directPerformer('awk', 'shout', createRng(2))
    expect(outcome).toMatchObject({ kind: 'executed', misfired: false })
  })
})

describe('Director 스태프 지시', () => {
  it('엇나가지 않으면 지정한 aim을 돌려주고 staffFatigue만 올린다', () => {
    const director = makeDirector()
    // staffFatigue 1 -> 확률 0.15, seed 1 첫 난수 0.63은 정상
    const [result, rng] = director.directStaff('cam', 'audience', createRng(1))
    expect(result).toEqual({ aim: 'audience', misfired: false })
    expect(rng.cursor).toBe(1)
    expect(director.staffFatigue).toBe(1)
    expect(director.fatigue).toBe(0)
    expect(director.directivesUsed('low')).toBe(0)
  })

  it('엇나가면 aim이 random이다', () => {
    const director = makeDirector()
    // seed 7 첫 난수 0.01 < 0.15
    const [result] = director.directStaff('cam', 'audience', createRng(7))
    expect(result).toEqual({ aim: 'random', misfired: true })
  })

  it('확률은 올린 뒤의 staffFatigue로 계산한다', () => {
    const director = makeDirector()
    director.directStaff('cam', 'audience', createRng(1))
    // staffFatigue 2 -> 0.3. seed 2 두 번째 난수 0.32는 정상, seed 1 두 번째 0.00은 엇나감
    const [clean] = director.directStaff('cam', 'audience', { seed: 2, cursor: 1 })
    expect(clean.misfired).toBe(false)
    const [bad] = director.directStaff('cam', 'audience', { seed: 1, cursor: 1 })
    expect(bad.misfired).toBe(true)
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
    director.resetFatigue()
    expect(director.fatigue).toBe(0)
    expect(director.staffFatigue).toBe(1)
    expect(director.directivesUsed('over')).toBe(3)
  })
})
