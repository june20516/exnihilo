import { createRng, forkSeed, nextFloat, nextInt, shuffle } from './rng'

test('같은 시드는 같은 수열', () => {
  const [a1, r1] = nextFloat(createRng(42))
  const [a2] = nextFloat(r1)
  const [b1, s1] = nextFloat(createRng(42))
  const [b2] = nextFloat(s1)
  expect([a1, a2]).toEqual([b1, b2])
  expect(a1).not.toBe(a2)
})

test('nextInt는 양끝 포함 범위', () => {
  let rng = createRng(7)
  const seen = new Set<number>()
  for (let i = 0; i < 200; i++) {
    const [n, next] = nextInt(rng, 1, 3)
    seen.add(n)
    rng = next
  }
  expect([...seen].sort()).toEqual([1, 2, 3])
})

test('shuffle은 원소를 보존하고 원본을 바꾸지 않는다', () => {
  const source = [1, 2, 3, 4, 5]
  const [out] = shuffle(createRng(1), source)
  expect([...out].sort()).toEqual(source)
  expect(source).toEqual([1, 2, 3, 4, 5])
})

function firstValues(seed: number, count: number): number[] {
  const values: number[] = []
  let rng = createRng(seed)
  for (let i = 0; i < count; i++) {
    const [value, next] = nextFloat(rng)
    values.push(value)
    rng = next
  }
  return values
}

test('forkSeed는 같은 입력이면 같은 값을 준다', () => {
  expect(forkSeed(42, 7)).toBe(forkSeed(42, 7))
})

test('forkSeed로 갈라낸 흐름은 원래 흐름과 첫 값 10개가 다르다', () => {
  const original = firstValues(42, 10)
  const forked = firstValues(forkSeed(42, 0x6c696665), 10)
  expect(forked).not.toEqual(original)
  expect(forked.every((value, i) => value !== original[i])).toBe(true)
})

test('forkSeed는 salt가 다르면 다른 흐름을 준다', () => {
  expect(firstValues(forkSeed(42, 1), 10)).not.toEqual(firstValues(forkSeed(42, 2), 10))
})
