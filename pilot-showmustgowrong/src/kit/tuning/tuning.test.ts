import { describe, expect, it, vi } from 'vitest'
import {
  changedValues,
  enforceConstraints,
  KEYS_CONTRACT_DETAIL,
  readOverrides,
  resolveTuning,
  validateTunables,
  violatedConstraints,
  writeOverrides,
  type TunableDef,
  type TuningConstraint,
  type TuningStorage,
} from './tuning'

const def = (overrides: Partial<TunableDef> = {}): TunableDef => ({
  key: 'A',
  group: '묶음',
  label: '이름',
  unit: '배',
  defaultValue: 5,
  min: 1,
  max: 10,
  step: 1,
  description: '설명',
  ...overrides,
})

const defs: readonly TunableDef[] = [def(), def({ key: 'B', defaultValue: 2 })]

describe('validateTunables', () => {
  it('정상 defs는 빈 배열', () => {
    expect(validateTunables(defs)).toEqual([])
  })
  it('키 중복', () => {
    const errors = validateTunables([def(), def()])
    expect(errors).toEqual(['키가 중복됩니다: A'])
  })
  it('min > max', () => {
    const errors = validateTunables([def({ min: 10, max: 1, defaultValue: 5 })])
    expect(errors).toContain('최솟값이 최댓값보다 큽니다: A')
  })
  it('step <= 0', () => {
    for (const step of [0, -1]) {
      const errors = validateTunables([def({ step })])
      expect(errors).toEqual(['간격은 0보다 커야 합니다: A'])
    }
  })
  it('기본값 범위 밖', () => {
    const errors = validateTunables([def({ defaultValue: 99 })])
    expect(errors).toEqual(['기본값이 범위 밖입니다: A'])
  })
  it('최솟값, 최댓값, 기본값, 간격이 유한한 수가 아니면 해당 필드 오류', () => {
    const cases: [Partial<TunableDef>, string][] = [
      [{ key: 'MIN', min: NaN }, '최솟값'],
      [{ key: 'MAX', max: Infinity }, '최댓값'],
      [{ key: 'DEF', defaultValue: NaN }, '기본값'],
      [{ key: 'STEP', step: Infinity }, '간격'],
    ]
    for (const [bad, fieldName] of cases) {
      const errors = validateTunables([def(bad)])
      expect(errors).toEqual([`${fieldName}은 유한한 수여야 합니다: ${bad.key}`])
    }
  })
})

describe('resolveTuning', () => {
  it('undefined/null이면 기본값, rejected 없음', () => {
    for (const input of [undefined, null]) {
      const r = resolveTuning(defs, input)
      expect(r.values).toEqual({ A: 5, B: 2 })
      expect(r.rejected).toEqual([])
    }
  })
  it('범위 안 값을 덮는다', () => {
    const r = resolveTuning(defs, { A: 3 })
    expect(r.values.A).toBe(3)
    expect(r.values.B).toBe(2)
    expect(r.rejected).toEqual([])
  })
  it('범위 밖', () => {
    const r = resolveTuning(defs, { A: 999 })
    expect(r.values.A).toBe(5)
    expect(r.rejected).toEqual([{ key: 'A', value: 999, reason: 'outOfRange' }])
  })
  it('숫자가 아님', () => {
    expect(resolveTuning(defs, { A: '3' }).rejected[0].reason).toBe('notNumber')
    expect(resolveTuning(defs, { A: NaN }).rejected[0].reason).toBe('notNumber')
    expect(resolveTuning(defs, { A: Infinity }).rejected[0].reason).toBe('notNumber')
  })
  it('모르는 키', () => {
    const r = resolveTuning(defs, { Z: 1 })
    expect(r.rejected).toEqual([{ key: 'Z', value: 1, reason: 'unknownKey' }])
    expect(r.values).toEqual({ A: 5, B: 2 })
  })
  it('객체가 아니면 전부 기본값', () => {
    for (const input of ['x', [1], 3, true]) {
      const r = resolveTuning(defs, input)
      expect(r.values).toEqual({ A: 5, B: 2 })
      expect(r.rejected).toEqual([{ key: '*', value: input, reason: 'notObject' }])
    }
  })
  it('경계값 min, max는 받아들인다', () => {
    expect(resolveTuning(defs, { A: 1 }).values.A).toBe(1)
    expect(resolveTuning(defs, { A: 10 }).values.A).toBe(10)
  })
})

describe('changedValues', () => {
  it('기본값과 같은 값은 빠진다', () => {
    expect(changedValues(defs, { A: 5, B: 7 })).toEqual({ B: 7 })
  })
})

const makeStorage = (overrides: Partial<TuningStorage> = {}): TuningStorage => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  ...overrides,
})

describe('readOverrides', () => {
  it('키 없음', () => {
    expect(readOverrides(makeStorage(), 'k')).toEqual({ overrides: undefined, error: null })
  })
  it('storage가 null', () => {
    expect(readOverrides(null, 'k')).toEqual({ overrides: undefined, error: null })
  })
  it('JSON을 읽는다', () => {
    const storage = makeStorage({ getItem: () => '{"A":3}' })
    expect(readOverrides(storage, 'k')).toEqual({ overrides: { A: 3 }, error: null })
  })
  it('깨진 JSON', () => {
    const r = readOverrides(makeStorage({ getItem: () => '{oops' }), 'k')
    expect(r.overrides).toBeUndefined()
    expect(typeof r.error).toBe('string')
  })
  it('getItem이 throw', () => {
    const r = readOverrides(
      makeStorage({
        getItem: () => {
          throw new Error('차단')
        },
      }),
      'k',
    )
    expect(r.overrides).toBeUndefined()
    expect(typeof r.error).toBe('string')
  })
})

describe('writeOverrides', () => {
  it('비어 있으면 키를 지운다', () => {
    const storage = makeStorage()
    expect(writeOverrides(storage, 'k', {})).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledWith('k')
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it('값이 있으면 JSON 저장', () => {
    const storage = makeStorage()
    expect(writeOverrides(storage, 'k', { A: 3 })).toBeNull()
    expect(storage.setItem).toHaveBeenCalledWith('k', '{"A":3}')
  })
  it('setItem이 throw하면 오류 문자열', () => {
    const storage = makeStorage({
      setItem: () => {
        throw new Error('가득 참')
      },
    })
    expect(typeof writeOverrides(storage, 'k', { A: 3 })).toBe('string')
  })
})

/** A < B */
const A_BELOW_B: TuningConstraint = {
  keys: ['A', 'B'],
  description: 'A는 B보다 작아야 합니다',
  holds: (values) => values.A < values.B,
}
/** 기본값(A 2, B 5)이 A < B를 지키는 defs */
const orderedDefs: readonly TunableDef[] = [def({ defaultValue: 2 }), def({ key: 'B', defaultValue: 5 })]

describe('violatedConstraints', () => {
  it('지켜지지 않는 관계만 돌려준다', () => {
    expect(violatedConstraints({ A: 2, B: 5 }, [A_BELOW_B])).toEqual([])
    expect(violatedConstraints({ A: 6, B: 5 }, [A_BELOW_B])).toEqual([A_BELOW_B])
  })
})

describe('enforceConstraints', () => {
  it('관계가 지켜지면 그대로 둔다', () => {
    const resolved = resolveTuning(orderedDefs, { A: 3 })
    expect(enforceConstraints(orderedDefs, resolved, [A_BELOW_B])).toEqual(resolved)
  })

  it('어긋나면 관계에 걸린 바뀐 값을 모두 기본값으로 되돌리고 conflict로 남긴다', () => {
    const resolved = resolveTuning(orderedDefs, { A: 8, B: 4, C: 1 })
    const enforced = enforceConstraints(orderedDefs, resolved, [A_BELOW_B])
    expect(enforced.values).toEqual({ A: 2, B: 5 })
    expect(enforced.rejected).toEqual([
      { key: 'C', value: 1, reason: 'unknownKey' },
      { key: 'A', value: 8, reason: 'conflict', detail: 'A는 B보다 작아야 합니다' },
      { key: 'B', value: 4, reason: 'conflict', detail: 'A는 B보다 작아야 합니다' },
    ])
  })

  it('하나만 바꿔 어긋나면 그 값만 버린다', () => {
    const enforced = enforceConstraints(orderedDefs, resolveTuning(orderedDefs, { A: 7 }), [A_BELOW_B])
    expect(enforced.values).toEqual({ A: 2, B: 5 })
    expect(enforced.rejected).toEqual([
      { key: 'A', value: 7, reason: 'conflict', detail: 'A는 B보다 작아야 합니다' },
    ])
  })

  it('되돌린 값 때문에 다른 관계가 어긋나면 그것도 되돌린다', () => {
    // B < C를 더한다.
    // A 6, B 6.5, C 6.2: B < C가 어긋나 B·C가 되돌려지면(B 5) 이제 A < B가 어긋난다.
    const threeDefs = [...orderedDefs, def({ key: 'C', defaultValue: 8 })]
    const bBelowC: TuningConstraint = {
      keys: ['B', 'C'],
      description: 'B는 C보다 작아야 합니다',
      holds: (values) => values.B < values.C,
    }
    const enforced = enforceConstraints(
      threeDefs,
      resolveTuning(threeDefs, { A: 6, B: 6.5, C: 6.2 }),
      [A_BELOW_B, bBelowC],
    )
    expect(enforced.values).toEqual({ A: 2, B: 5, C: 8 })
    expect(enforced.rejected.map((item) => item.key)).toEqual(['B', 'C', 'A'])
  })

  // timeout 1000ms: 끝나지 않는 회귀를 실패로 보고한다
  it('keys에 빠진 키에 기대는 관계가 어긋나도 끝나며, 바뀐 값을 모두 기본값으로 되돌린다', () => {
    // keys 계약을 어긴 관계: B에 기대지만 keys에는 A만 있다
    const leaky: TuningConstraint = {
      keys: ['A'],
      description: 'B는 6보다 작아야 합니다',
      holds: (values) => values.B < 6,
    }
    const enforced = enforceConstraints(orderedDefs, resolveTuning(orderedDefs, { B: 7 }), [leaky])
    expect(enforced.values).toEqual({ A: 2, B: 5 })
    expect(enforced.rejected).toEqual([{ key: 'B', value: 7, reason: 'conflict', detail: KEYS_CONTRACT_DETAIL }])
  }, 1000)

  it('기본값끼리 어긋나는 관계는 오류다', () => {
    const resolved = resolveTuning(defs, undefined)
    expect(() => enforceConstraints(defs, resolved, [A_BELOW_B])).toThrow('A는 B보다 작아야 합니다')
  })
})
