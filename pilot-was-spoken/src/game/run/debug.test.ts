import { weakenNewCombat } from './debug'
import { isCombatEvent, reduceRun, type RunState, startRun } from './run'

const enemyHps = (s: RunState) => (s.combat?.entities ?? []).filter((e) => e.side === 'enemy').map((e) => e.hp)

test('런 시작 직후의 전투는 적 HP가 n이 된다', () => {
  const run = startRun(1).state
  const weakened = weakenNewCombat(null, run, 1)
  expect(enemyHps(weakened).length).toBeGreaterThan(0)
  expect(enemyHps(weakened).every((hp) => hp === 1)).toBe(true)
})

test('같은 전투 안의 행동 뒤에는 바꾸지 않는다', () => {
  const before = startRun(1).state
  const after = reduceRun(before, { type: 'combat', action: { type: 'endTurn' } }).state
  expect(weakenNewCombat(before, after, 1)).toBe(after)
})

test('상점에서 떠나 새 층 전투가 시작되면 적 HP가 n이 된다', () => {
  // 한 번의 낭독으로 끝나도록 1층 적이 하나인 시드를 고른다.
  const seed = Array.from({ length: 20 }, (_, i) => i + 1).find((n) => enemyHps(startRun(n).state).length === 1) ?? 1
  const start = weakenNewCombat(null, startRun(seed).state, 1)
  const hand = start.combat?.deck.hand ?? []
  const combat = start.combat && { ...start.combat, deck: { ...start.combat.deck, hand: [{ instanceId: 'w0', wordId: 'bite' }, ...hand] } }
  let shop: RunState = { ...start, combat }
  shop = reduceRun(shop, { type: 'combat', action: { type: 'place', instanceId: 'w0', at: { clause: 0, role: 'verb' } } }).state
  shop = reduceRun(shop, { type: 'combat', action: { type: 'cast' } }).state
  expect(shop.phase).toBe('shop')
  const next = reduceRun(shop, { type: 'leave' }).state
  const weakened = weakenNewCombat(shop, next, 1)
  expect(weakened.floor).toBe(2)
  expect(enemyHps(weakened).every((hp) => hp === 1)).toBe(true)
})

test('isCombatEvent: 런 전용 이벤트(층 통과·구매·런 종료)는 전투 이벤트가 아니다', () => {
  expect(isCombatEvent({ type: 'floorCleared', floor: 1, gold: 25 })).toBe(false)
  expect(isCombatEvent({ type: 'runEnded', outcome: 'won' })).toBe(false)
  expect(isCombatEvent({ type: 'enemyTurn' })).toBe(true)
})
