import { resolvesTurn } from './events'

test('resolvesTurn: 낭독이나 적의 차례가 들어 있으면 차례가 넘어가는 행동이다', () => {
  expect(resolvesTurn([{ type: 'cast', by: 'player' }])).toBe(true)
  expect(resolvesTurn([{ type: 'enemyTurn' }])).toBe(true)
  expect(resolvesTurn([{ type: 'placed', at: { clause: 0, role: 'verb' }, wordId: 'bite', modifierIndex: null }])).toBe(false)
  expect(resolvesTurn([])).toBe(false)
})
