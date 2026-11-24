import { createRng } from '@/kit/core/rng'
import { addToDiscard, createDeck, discardHand, draw, takeFromHand } from './deck'

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ instanceId: `c${i}` }))

test('4장 드로우', () => {
  const { deck, rng } = createDeck(cards(10), createRng(1))
  const r = draw(deck, 4, rng)
  expect(r.deck.hand).toHaveLength(4)
  expect(r.deck.drawPile).toHaveLength(6)
  expect(r.reshuffled).toBe(false)
})

test('덱이 모자라면 버림 더미를 섞어 보충', () => {
  const { deck, rng } = createDeck(cards(5), createRng(1))
  const a = draw(deck, 4, rng)
  const b = draw(discardHand(a.deck), 4, a.rng)
  expect(b.reshuffled).toBe(true)
  expect(b.deck.hand).toHaveLength(4)
  expect(b.deck.drawPile).toHaveLength(1)
  expect(b.deck.discardPile).toHaveLength(0)
})

test('덱과 버림 더미가 모두 비면 있는 만큼만 뽑는다', () => {
  const { deck, rng } = createDeck(cards(2), createRng(1))
  const r = draw(deck, 4, rng)
  expect(r.drawn).toHaveLength(2)
  expect(r.deck.hand).toHaveLength(2)
})

test('takeFromHand는 손패에서 카드를 꺼내고, 없는 카드면 null', () => {
  const { deck, rng } = createDeck(cards(1), createRng(1))
  const drawn = draw(deck, 1, rng).deck
  const taken = takeFromHand(drawn, 'c0')
  expect(taken?.card).toEqual({ instanceId: 'c0' })
  expect(taken?.deck.hand).toHaveLength(0)
  expect(takeFromHand(drawn, 'nope')).toBeNull()
})

test('addToDiscard는 버림 더미 끝에 추가', () => {
  const { deck } = createDeck(cards(1), createRng(1))
  expect(addToDiscard(deck, [{ instanceId: 'x' }]).discardPile).toEqual([{ instanceId: 'x' }])
})
