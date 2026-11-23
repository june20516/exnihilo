import { BALANCE } from '@/game/content/balance'
import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import type { WordId } from '@/game/content/words'
import { getSlot } from '@/game/sentence/board'
import { type CardInst, nextSealRole, type RallyAction, type RallyState, reduceRally, startRally } from './combat'
import { intentClause } from './testFixtures'

RALLY_ENCOUNTERS['test-seal'] = {
  id: 'test-seal',
  name: '시험 필경사',
  tier: 'boss',
  enemies: [{ defId: 'spider', name: '필경사', hp: 60, row: 'front', portrait: '', intents: [{ kind: 'seal' }, intentClause('spider', 'testBite')] }],
}
RALLY_ENCOUNTERS['test-seal-only'] = {
  id: 'test-seal-only',
  name: '봉인만 하는 필경사',
  tier: 'boss',
  enemies: [{ defId: 'spider', name: '필경사', hp: 60, row: 'front', portrait: '', intents: [{ kind: 'seal' }] }],
}

const S = { clause: 0, role: 'subject' } as const
const V = { clause: 0, role: 'verb' } as const
const DECK: WordId[] = ['bite', 'bite', 'bite', 'guard', 'guard', 'hide', 'rage', 'scare', 'mend', 'fiercely', 'hungry', 'cracked']
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a, BALANCE)
const withHand = (s: RallyState, words: WordId[]): RallyState => ({
  ...s,
  deck: { drawPile: [], discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
})
const sealed = (s: RallyState) => s.board.clauses[0].slots.filter((slot) => slot.sealed).map((slot) => slot.role)

test('봉인: 적 턴 뒤 내 주어 슬롯이 봉인되고, 주어에 놓으면 slotSealed(수식어 칸도)', () => {
  const r = act(startRally('test-seal', DECK, 1, BALANCE).state, { type: 'endTurn' })
  expect(r.events).toContainEqual({ type: 'sealed', role: 'subject' })
  expect(sealed(r.state)).toEqual(['subject'])
  const s = withHand(r.state, ['you', 'hungry'])
  expect(act(s, { type: 'place', instanceId: 'h0', at: S }).events[0]).toMatchObject({ reason: 'slotSealed' })
  expect(act(s, { type: 'place', instanceId: 'h1', at: S, modifierIndex: 0 }).events[0]).toMatchObject({ reason: 'slotSealed' })
})

test('봉인: 봉인된 주어도 생략 기본값(당신)으로 낭독된다', () => {
  const t2 = withHand(act(startRally('test-seal', DECK, 1, BALANCE).state, { type: 'endTurn' }).state, ['bite'])
  const r = act(act(t2, { type: 'place', instanceId: 'h0', at: V }).state, { type: 'cast' })
  expect(r.events).toContainEqual(expect.objectContaining({ type: 'damaged', entityId: 'e0', sourceId: 'p' }))
})

test('봉인: 다음 적 턴 시작에 풀린다', () => {
  const t2 = act(startRally('test-seal', DECK, 1, BALANCE).state, { type: 'endTurn' }).state
  expect(sealed(act(t2, { type: 'endTurn' }).state)).toEqual([])
  expect(getSlot(act(t2, { type: 'endTurn' }).state.board, S).sealed).toBe(false)
})

test('봉인 대상은 주어 → 목적어 → 동사 순환, 예고에서 미리 알 수 있다', () => {
  let s = startRally('test-seal-only', DECK, 1, BALANCE).state
  const order: string[] = []
  for (let i = 0; i < 4; i++) {
    const expected = nextSealRole(s)
    s = act(s, { type: 'endTurn' }).state
    expect(sealed(s)).toEqual([expected])
    order.push(expected)
  }
  expect(order).toEqual(['subject', 'object', 'verb', 'subject'])
})
