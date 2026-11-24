import { HAND_LAYOUT, overlapFor } from './handLayout'

const CARD = HAND_LAYOUT.cardWidth

test('4장 이하는 겹치지 않는다(폭이 넉넉하면)', () => expect(overlapFor(4, 2000)).toBe(0))

test('장수가 늘면 겹침이 늘되, 폭이 넉넉하면 규칙 상한에서 멈춘다', () => {
  expect(overlapFor(6, 2000)).toBeGreaterThan(overlapFor(5, 2000))
  expect(overlapFor(20, 100_000)).toBe(HAND_LAYOUT.maxRuleOverlap)
})

test('남은 폭에 다 들어가도록 겹침을 더 늘린다(12장, 폭 600)', () => {
  const overlap = overlapFor(12, 600)
  expect(12 * CARD - 11 * overlap).toBeLessThanOrEqual(600)
})

test('아무리 좁아도 카드마다 최소 폭은 보인다', () => {
  expect(CARD - overlapFor(30, 300)).toBeGreaterThanOrEqual(HAND_LAYOUT.minVisible)
})
