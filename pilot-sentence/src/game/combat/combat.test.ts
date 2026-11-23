import { BALANCE } from '@/game/content/balance'
import { STARTER_DECK } from '@/game/content/encounters'
import { getSlot } from '@/game/sentence/board'
import { type CombatState, currentIntent, reduceCombat, startCombat, upcomingIntents } from './combat'

const start = () => startCombat('spider', STARTER_DECK, 123, BALANCE).state
const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const hp = (s: CombatState, id: string) => s.entities.find((e) => e.id === id)?.hp
const withHand = (s: CombatState, hand: { instanceId: string; wordId: string }[]): CombatState => ({
  ...s, deck: { drawPile: [], discardPile: [], hand },
})

test('시작: 손패 4, 행동력 3, 첫 예고는 주어 되돌림', () => {
  const r = startCombat('spider', STARTER_DECK, 123, BALANCE)
  expect(r.state.deck.hand).toHaveLength(4)
  expect(r.state.ap).toBe(3)
  expect(currentIntent(r.state)).toEqual({ kind: 'revert', at: S })
  expect(r.events).toContainEqual({ type: 'drawn', count: 4, reshuffled: false })
  expect(r.events).toContainEqual({ type: 'intentRevealed', step: { kind: 'revert', at: S } })
})

test('행동력이 부족하면 rejected(notEnoughAp)이고 상태 불변', () => {
  const s = { ...start(), ap: 0 }
  const card = s.deck.hand[0]
  const r = reduceCombat(s, { type: 'place', instanceId: card.instanceId, at: S }, BALANCE)
  expect(r.state).toBe(s)
  expect(r.events).toEqual([{ type: 'rejected', reason: 'notEnoughAp', at: S }])
})

test('품사가 맞지 않으면 rejected(kindMismatch)이고 행동력 불변', () => {
  const s = withHand(start(), [{ instanceId: 'a', wordId: 'bite' }])
  const r = reduceCombat(s, { type: 'place', instanceId: 'a', at: S }, BALANCE)
  expect(r.state).toBe(s)
  expect(r.events).toEqual([{ type: 'rejected', reason: 'kindMismatch', at: S }])
})

test('오염 단어는 놓을 수 없다', () => {
  const s = withHand(start(), [{ instanceId: 'w', wordId: 'web' }])
  expect(reduceCombat(s, { type: 'place', instanceId: 'w', at: S }, BALANCE).events[0])
    .toMatchObject({ type: 'rejected', reason: 'unplayable' })
})

test('같은 슬롯을 두 번 덮으면 행동력 2 소모, 첫 카드는 버림 더미로', () => {
  const s0 = withHand(start(), [{ instanceId: 'a', wordId: 'you' }, { instanceId: 'b', wordId: 'scarecrow' }])
  const s1 = reduceCombat(s0, { type: 'place', instanceId: 'a', at: S }, BALANCE).state
  const s2 = reduceCombat(s1, { type: 'place', instanceId: 'b', at: S }, BALANCE).state
  expect(s2.ap).toBe(1)
  expect(s2.deck.discardPile.map((c) => c.instanceId)).toEqual(['a'])
  expect(getSlot(s2.board, S).head.wordId).toBe('scarecrow')
})

test('지목은 적이 하나면 자동 지정된다', () => {
  const s0 = withHand(start(), [{ instanceId: 'm', wordId: 'mark' }])
  const s1 = reduceCombat(s0, { type: 'place', instanceId: 'm', at: O }, BALANCE).state
  expect(getSlot(s1.board, O).head.targetEntityId).toBe('e0')
})

test('턴 종료: 예고된 주어 되돌림이 내 편집을 무효화한다', () => {
  const s0 = withHand(start(), [{ instanceId: 'a', wordId: 'you' }])
  const s1 = reduceCombat(s0, { type: 'place', instanceId: 'a', at: S }, BALANCE).state
  const r = reduceCombat(s1, { type: 'endTurn' }, BALANCE)
  // 피해 6(물어뜯는다) 후 턴 종료 독 틱 2 → 52
  expect(hp(r.state, 'p')).toBe(52)
  const types = r.events.map((e) => e.type)
  expect(types.indexOf('intervention')).toBeLessThan(types.indexOf('clauseExecuted'))
  const all = [...r.state.deck.hand, ...r.state.deck.drawPile, ...r.state.deck.discardPile]
  expect(all.map((c) => c.instanceId)).toContain('a')
})

test('턴 종료 후 다음 예고, 행동력 충전, 드로우', () => {
  const r = reduceCombat(start(), { type: 'endTurn' }, BALANCE)
  expect(r.state.turn).toBe(2)
  expect(r.state.ap).toBe(3)
  expect(r.state.deck.hand).toHaveLength(4)
  expect(currentIntent(r.state)).toEqual({ kind: 'revert', at: O })
})

const sturdy = (s: CombatState): CombatState => ({
  ...s,
  entities: s.entities.map((e) => (e.id === 'p' ? { ...e, hp: 999, maxHp: 999 } : e)),
})

test('4번째 개입은 오염: 덱 어딘가에 거미줄 1장', () => {
  let s = sturdy(start())
  for (let i = 0; i < 4; i++) s = reduceCombat(s, { type: 'endTurn' }, BALANCE).state
  const all = [...s.deck.hand, ...s.deck.drawPile, ...s.deck.discardPile].map((c) => c.wordId)
  expect(all.filter((w) => w === 'web')).toHaveLength(1)
})

test('거미가 자기 자신을 물게 하면 won, 이후 행동은 notPlayerTurn', () => {
  const base = start()
  const s0 = withHand(
    { ...base, entities: base.entities.map((e) => (e.side === 'enemy' ? { ...e, hp: 1 } : e)) },
    [{ instanceId: 'm', wordId: 'mark' }],
  )
  const s1 = reduceCombat(s0, { type: 'place', instanceId: 'm', at: O }, BALANCE).state
  const r = reduceCombat(s1, { type: 'endTurn' }, BALANCE)
  expect(r.state.phase).toBe('won')
  expect(r.events).toContainEqual({ type: 'combatEnded', outcome: 'won' })
  expect(reduceCombat(r.state, { type: 'endTurn' }, BALANCE).events[0])
    .toMatchObject({ type: 'rejected', reason: 'notPlayerTurn' })
})

test('플레이어와 적이 같은 턴에 쓰러지면 lost', () => {
  const base = start()
  const s0: CombatState = {
    ...base,
    entities: base.entities.map((e) => ({
      ...e, hp: 1, statuses: { ...e.statuses, poison: e.side === 'enemy' ? 5 : 0 },
    })),
  }
  const r = reduceCombat(s0, { type: 'endTurn' }, BALANCE)
  expect(r.state.phase).toBe('lost')
  expect(r.events).toContainEqual({ type: 'combatEnded', outcome: 'lost' })
})

test('잉크가 마른 단어는 버림 더미로 돌아간다', () => {
  // 동사 수식어는 거미의 처음 두 개입(주어·목적어 되돌림)에 닿지 않는다
  const V = { clause: 0, role: 'verb' } as const
  const s0 = withHand(start(), [{ instanceId: 'b', wordId: 'fiercely' }])
  let s = reduceCombat(s0, { type: 'place', instanceId: 'b', at: V }, BALANCE).state
  s = reduceCombat(s, { type: 'endTurn' }, BALANCE).state
  const r = reduceCombat(s, { type: 'endTurn' }, BALANCE)
  expect(r.events).toContainEqual({ type: 'dried', at: V, wordId: 'fiercely', modifierIndex: 0 })
  const all = [...r.state.deck.hand, ...r.state.deck.drawPile, ...r.state.deck.discardPile]
  expect(all.map((c) => c.instanceId)).toContain('b')
})

test('같은 시드와 행동이면 같은 결과', () => {
  const a = reduceCombat(start(), { type: 'endTurn' }, BALANCE).state
  const b = reduceCombat(start(), { type: 'endTurn' }, BALANCE).state
  expect(a).toEqual(b)
})

test('5번째 개입은 격앙: 이후 예고가 2개, 턴 종료마다 개입 2번', () => {
  let s = sturdy(start())
  for (let i = 0; i < 5; i++) s = reduceCombat(s, { type: 'endTurn' }, BALANCE).state
  expect(s.enraged).toBe(true)
  expect(upcomingIntents(s)).toHaveLength(2)
  const r = reduceCombat(s, { type: 'endTurn' }, BALANCE)
  expect(r.events.filter((e) => e.type === 'intervention')).toHaveLength(2)
  expect(r.events.filter((e) => e.type === 'intentRevealed')).toHaveLength(2)
})
