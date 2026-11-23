/** 시드 기반 난수 상태. 같은 seed와 cursor는 항상 같은 값을 만든다. */
export interface RngState {
  readonly seed: number
  readonly cursor: number
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0, cursor: 0 }
}

/** mulberry32를 (seed + cursor)에 적용해 [0, 1) 값을 만든다. */
export function nextFloat(rng: RngState): [number, RngState] {
  let t = (rng.seed + Math.imul(rng.cursor + 1, 0x6d2b79f5)) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, { seed: rng.seed, cursor: rng.cursor + 1 }]
}

/** min 이상 max 이하의 정수. */
export function nextInt(rng: RngState, min: number, max: number): [number, RngState] {
  const [value, next] = nextFloat(rng)
  return [min + Math.floor(value * (max - min + 1)), next]
}

/** Fisher–Yates. 원본 배열은 바꾸지 않는다. */
export function shuffle<T>(rng: RngState, items: readonly T[]): [T[], RngState] {
  const result = [...items]
  let current = rng
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = nextInt(current, 0, i)
    current = next
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return [result, current]
}
