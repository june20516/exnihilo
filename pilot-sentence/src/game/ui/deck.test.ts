import { RALLY_STARTER_DECK } from '@/game/content/enemies'
import { DECK_LIMITS, loadDeck, validateDeck } from './deck'

test('시작 덱은 유효하다', () => {
  expect(validateDeck(RALLY_STARTER_DECK)).toEqual({ ok: true })
})

test('장수 범위를 벗어나면 무효', () => {
  expect(validateDeck(RALLY_STARTER_DECK.slice(0, DECK_LIMITS.min - 1))).toMatchObject({ ok: false })
  expect(validateDeck(Array.from({ length: DECK_LIMITS.max + 1 }, () => 'bite'))).toMatchObject({ ok: false })
})

test('적 전용·오염·없는 단어는 무효', () => {
  expect(validateDeck([...RALLY_STARTER_DECK.slice(0, 13), 'spider'])).toMatchObject({ ok: false })
  expect(validateDeck([...RALLY_STARTER_DECK.slice(0, 13), 'web'])).toMatchObject({ ok: false })
  expect(validateDeck([...RALLY_STARTER_DECK.slice(0, 13), 'nope'])).toMatchObject({ ok: false })
})

test('loadDeck: 저장된 값이 없거나 깨졌거나 무효면 시작 덱', () => {
  expect(loadDeck(null)).toEqual(RALLY_STARTER_DECK)
  expect(loadDeck('not json')).toEqual(RALLY_STARTER_DECK)
  expect(loadDeck(JSON.stringify(['spider']))).toEqual(RALLY_STARTER_DECK)
  const custom = [...RALLY_STARTER_DECK.slice(0, 13), 'slash']
  expect(loadDeck(JSON.stringify(custom))).toEqual(custom)
})
