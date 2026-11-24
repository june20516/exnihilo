import { HAND_LAYOUT, overlapFor } from './handLayout'

const CARD = HAND_LAYOUT.cardWidth

test('폭이 넉넉하면 장수와 상관없이 겹치지 않는다', () => {
  expect(overlapFor(4, 2000)).toBe(0)
  expect(overlapFor(6, 6 * CARD)).toBe(0)
  expect(overlapFor(12, 100_000)).toBe(0)
})

test('폭이 모자라면 남은 폭에 다 들어가도록 딱 그만큼 겹친다(12장, 폭 600)', () => {
  const overlap = overlapFor(12, 600)
  expect(12 * CARD - 11 * overlap).toBeLessThanOrEqual(600)
  expect(12 * CARD - 11 * (overlap - 1)).toBeGreaterThan(600)
})

test('아무리 좁아도 카드마다 최소 폭은 보인다', () => {
  expect(CARD - overlapFor(30, 300)).toBeGreaterThanOrEqual(HAND_LAYOUT.minVisible)
})
