import { createRng, nextInt, type RngState } from '@/kit/core/rng'
import type { WordId } from '@/game/content/words'
import { playerWordsOnBoard } from '@/game/sentence/board'
import { type CardInst, type RallyAction, type RallyState, reduceRally, startRally } from './combat'
import { hasVerb } from './sentence'
import './testFixtures'

const V0 = { clause: 0, role: 'verb' } as const
const V1 = { clause: 1, role: 'verb' } as const
const DECK: WordId[] = ['bite', 'bite', 'bite', 'guard', 'guard', 'hide', 'rage', 'scare', 'mend', 'fiercely', 'hungry', 'cracked', 'and', 'so', 'while']
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a)
const hp = (s: RallyState, id: string) => s.entities.find((e) => e.id === id)?.hp
const withHand = (words: WordId[]): RallyState => ({
  ...startRally('test-dummy', DECK, 1).state,
  deck: {
    drawPile: (['guard', 'hide', 'rage', 'scare', 'mend'] as const).map((wordId, i): CardInst => ({ instanceId: `d${i}`, wordId })),
    discardPile: [],
    hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })),
  },
})
/** 손패 [동사1, 연결어, 동사2, ...]를 놓은 상태. extra는 [손패 번호, 위치, 칸]. */
function twoClauses(words: WordId[], extra: [number, { clause: number; role: 'subject' | 'object' | 'verb' }, number?][] = []) {
  let s = act(withHand(words), { type: 'place', instanceId: 'h0', at: V0 }).state
  s = act(s, { type: 'connect', instanceId: 'h1' }).state
  s = act(s, { type: 'place', instanceId: 'h2', at: V1 }).state
  for (const [index, at, modifierIndex] of extra) s = act(s, { type: 'place', instanceId: `h${index}`, at, modifierIndex }).state
  return s
}

test('연결어를 놓으면 절이 둘, 빼면 하나이고 둘째 절의 카드와 연결어는 손패로', () => {
  const s = twoClauses(['bite', 'and', 'guard'])
  expect(s.board.clauses).toHaveLength(2)
  expect(s.connective?.wordId).toBe('and')
  const r = act(s, { type: 'disconnect' }).state
  expect(r.board.clauses).toHaveLength(1)
  expect(r.connective).toBeNull()
  expect(r.deck.hand.map((c) => c.instanceId).sort()).toEqual(['h1', 'h2'])
})

test('연결어가 아닌 카드를 connect하면 kindMismatch', () => {
  expect(act(withHand(['bite']), { type: 'connect', instanceId: 'h0' }).events[0]).toMatchObject({ reason: 'kindMismatch' })
})

test('연결어를 바꾸면 이전 연결어는 손패로, 둘째 절은 유지', () => {
  let s = twoClauses(['bite', 'and', 'guard', 'so'])
  s = act(s, { type: 'connect', instanceId: 'h3' }).state
  expect(s.connective?.wordId).toBe('so')
  expect(s.deck.hand.map((c) => c.instanceId)).toContain('h1')
  expect(hasVerb(s.board)).toBe(true)
})

test('둘째 절에 동사가 없으면 낭독은 noVerb', () => {
  let s = act(withHand(['bite', 'and']), { type: 'place', instanceId: 'h0', at: V0 }).state
  s = act(s, { type: 'connect', instanceId: 'h1' }).state
  expect(act(s, { type: 'cast' }).events[0]).toMatchObject({ reason: 'noVerb' })
})

test('그리고: 물어뜯는다 그리고 막는다 → 적 피해 6, 반격 7 중 6 막음', () => {
  const r = act(twoClauses(['bite', 'and', 'guard']), { type: 'cast' })
  expect(hp(r.state, 'e0')).toBe(24)
  expect(hp(r.state, 'p')).toBe(59)
})

test('그래서: 물어뜯는다(6) 그래서 물어뜯는다 → 둘째 피해 6+3', () => {
  expect(hp(act(twoClauses(['bite', 'so', 'bite']), { type: 'cast' }).state, 'e0')).toBe(30 - 6 - 9)
})

test('그러면서: [격렬하게] 물어뜯는다 그러면서 물어뜯는다 → 둘째도 9', () => {
  const s = twoClauses(['bite', 'while', 'bite', 'fiercely'], [[3, V0, 0]])
  expect(hp(act(s, { type: 'cast' }).state, 'e0')).toBe(30 - 9 - 9)
})

test('낭독하면 연결어와 두 절의 카드가 모두 버림 더미, 문장은 한 절', () => {
  const r = act(twoClauses(['bite', 'and', 'guard']), { type: 'cast' }).state
  expect(r.board.clauses).toHaveLength(1)
  expect(r.connective).toBeNull()
  expect(r.deck.discardPile.map((c) => c.instanceId).sort()).toEqual(['h0', 'h1', 'h2'])
})

test('비우기와 턴 종료는 연결어와 두 절의 카드를 손패로', () => {
  const cleared = act(twoClauses(['bite', 'and', 'guard']), { type: 'clear' }).state
  expect(cleared.board.clauses).toHaveLength(1)
  expect(cleared.deck.hand.map((c) => c.instanceId).sort()).toEqual(['h0', 'h1', 'h2'])
})

test('카드 보존: connect/disconnect를 섞은 무작위 200회', () => {
  const ids = (s: RallyState) =>
    [...s.deck.hand, ...s.deck.drawPile, ...s.deck.discardPile].map((c) => c.instanceId)
      .concat(playerWordsOnBoard(s.board).flatMap((w) => (w.instanceId ? [w.instanceId] : [])))
      .concat(s.connective?.instanceId ? [s.connective.instanceId] : [])
      .sort()
  let s = startRally('test-dummy', DECK, 9).state
  s = { ...s, entities: s.entities.map((e) => ({ ...e, hp: 9999, maxHp: 9999 })) }
  const expected = ids(s)
  let rng: RngState = createRng(11)
  const roles = ['subject', 'object', 'verb'] as const
  for (let i = 0; i < 200 && s.phase === 'player'; i++) {
    const [kind, r1] = nextInt(rng, 0, 6)
    const [pick, r2] = nextInt(r1, 0, Math.max(0, s.deck.hand.length - 1))
    const [role, r3] = nextInt(r2, 0, 2)
    const [clause, r4] = nextInt(r3, 0, 1)
    const [mod, r5] = nextInt(r4, -1, 1)
    rng = r5
    const card = s.deck.hand[pick]
    const actions: RallyAction[] = [
      card ? { type: 'place', instanceId: card.instanceId, at: { clause, role: roles[role] }, modifierIndex: mod < 0 ? undefined : mod } : { type: 'endTurn' },
      card ? { type: 'connect', instanceId: card.instanceId } : { type: 'clear' },
      { type: 'disconnect' },
      { type: 'clear' },
      { type: 'cast' },
      { type: 'endTurn' },
      card ? { type: 'discard', instanceIds: [card.instanceId] } : { type: 'clear' },
    ]
    s = act(s, actions[kind]).state
    expect(ids(s)).toEqual(expected)
  }
})

test('연결어가 없을 때 둘째 절에 놓으면 slotInactive(예외 없이)', () => {
  expect(act(withHand(['bite']), { type: 'place', instanceId: 'h0', at: V1 }).events[0]).toMatchObject({ reason: 'slotInactive' })
})
