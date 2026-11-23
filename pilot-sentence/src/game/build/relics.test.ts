import { BALANCE } from '@/game/content/balance'
import type { SlotAddress } from '@/game/content/enemies'
import type { WordId } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import { type CardInst, clauseHooks, type RallyState, reduceRally, startRally } from '@/game/rally/combat'
import { sentenceFormula } from '@/game/rally/formula'
import '@/game/rally/testFixtures'
import { EMPTY_BUILD, type RelicId } from './build'
import { RELICS } from './relics'

const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
const DECK: WordId[] = ['bite', 'guard', 'hide', 'rage', 'scare', 'mend', 'slash', 'bite', 'bite', 'guard', 'fiercely', 'hungry', 'cracked', 'venomous', 'blind']

/** 유물 하나를 가진 test-dummy 전투에서, 주어진 단어를 순서대로 놓은 상태. */
function setup(relics: RelicId[], placements: [WordId, SlotAddress, number?][]): RallyState {
  const base = startRally('test-dummy', DECK, 1, BALANCE, { build: { ...EMPTY_BUILD, relics } }).state
  const hand = placements.map(([wordId], i): CardInst => ({ instanceId: `h${i}`, wordId }))
  const draw = (['guard', 'hide', 'rage', 'scare', 'mend'] as const).map((wordId, i): CardInst => ({ instanceId: `d${i}`, wordId }))
  let s: RallyState = { ...base, deck: { drawPile: draw, discardPile: [], hand } }
  placements.forEach(([, at, modifierIndex], i) => {
    s = reduceRally(s, { type: 'place', instanceId: `h${i}`, at, modifierIndex }, BALANCE).state
  })
  return s
}
const cast = (s: RallyState) => reduceRally(s, { type: 'cast' }, BALANCE)
const hits = (events: readonly CombatEvent[]) =>
  events.filter((e): e is Extract<CombatEvent, { type: 'damaged' }> => e.type === 'damaged' && e.entityId === 'e0')

test('유물 정의 8종: 이름과 희귀도', () => {
  expect(Object.keys(RELICS)).toHaveLength(8)
  expect(RELICS.longSentence).toMatchObject({ name: '긴 문장', rarity: 'common' })
  expect(RELICS.stress).toMatchObject({ name: '강세', rarity: 'rare' })
})

test('유물 없음: 훅은 비어 있다', () => expect(clauseHooks(setup([], [['bite', V]]), 0)).toEqual({}))

test('긴 문장: 3장 → 기본값 6+6, ((12 × 1.5) + 4) = 22', () => {
  const s = setup(['longSentence'], [['bite', V], ['fiercely', V, 0], ['hungry', S, 0]])
  expect(hits(cast(s).events)[0]?.amount).toBe(22)
  expect(sentenceFormula(s)?.text).toBe('(6 + 유물 6) × 1.5 + 4 = 22')
})

test('생략의 미학: 주어를 비우면 10, 당신을 놓으면 6', () => {
  expect(hits(cast(setup(['ellipsis'], [['bite', V]])).events)[0]?.amount).toBe(10)
  expect(hits(cast(setup(['ellipsis'], [['bite', V], ['you', S]])).events)[0]?.amount).toBe(6)
})

test('수식의 사슬: 목적어에 금이 간 2장 → 6 × 1.5 × 1.5 × 2 = 27', () => {
  const s = setup(['adjectiveChain'], [['bite', V], ['cracked', O, 0], ['cracked', O, 1]])
  expect(hits(cast(s).events)[0]?.amount).toBe(27)
  expect(sentenceFormula(s)?.value).toBe(27)
})

test('강세: 격렬하게 ×2.25 → 13', () => {
  const s = setup(['stress'], [['bite', V], ['fiercely', V, 0]])
  expect(hits(cast(s).events)[0]?.amount).toBe(13)
  expect(sentenceFormula(s)?.text).toBe('6 × 2.25 = 13')
})

test('독의 문법: 독을 뿜는 주어로 물면 독 4', () => {
  const r = cast(setup(['poisonGrammar'], [['bite', V], ['venomous', S, 0]]))
  expect(r.events).toContainEqual({ type: 'statusApplied', entityId: 'e0', status: 'poison', amount: 4 })
})

test('메아리: 연결어 없이 낭독하면 두 번 실행', () => {
  expect(hits(cast(setup(['echo'], [['bite', V]])).events)).toHaveLength(2)
})

test('허수아비 화자: 동사만 놓으면 허수아비가 소환되어 문다', () => {
  const r = cast(setup(['scarecrowSpeaker'], [['bite', V]]))
  const summoned = r.events.find((e) => e.type === 'summoned')
  expect(summoned).toMatchObject({ tokenId: 'scarecrow' })
  expect(hits(r.events)[0]?.sourceId).toBe(summoned?.type === 'summoned' ? summoned.entityId : '')
})

test('울림: 낭독한 동사 카드는 버림 더미 대신 손패로 돌아온다', () => {
  const r = cast(setup(['resonance'], [['bite', V], ['fiercely', V, 0]]))
  expect(r.state.deck.hand.map((c) => c.instanceId)).toContain('h0')
  expect(r.state.deck.discardPile.map((c) => c.instanceId)).toContain('h1')
})
