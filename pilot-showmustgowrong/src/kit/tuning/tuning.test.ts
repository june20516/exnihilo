import { describe, expect, it, vi } from 'vitest'
import {
  changedValues,
  readOverrides,
  resolveTuning,
  validateTunables,
  writeOverrides,
  type TunableDef,
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
