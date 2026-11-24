import { BALANCE } from '@/game/content/balance'
import type { SlotAddress } from '@/game/content/enemies'
import type { WordId } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import { type CardInst, type RallyState, reduceRally, startRally } from '@/game/rally/combat'
import { clauseHooks, hooksFromEffects } from '@/game/rally/hooks'
import { sentenceFormula } from '@/game/rally/formulaText'
import '@/game/rally/testFixtures'
import { EMPTY_BUILD, type RelicId } from './build'
import { RELICS, type RelicEffect } from './relics'

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
  expect(sentenceFormula(s)[0]?.text).toBe('(6 + 유물 6) × 1.5 + 4 = 22')
})

test('생략의 미학: 주어를 비우면 10, 당신을 놓으면 6', () => {
  expect(hits(cast(setup(['ellipsis'], [['bite', V]])).events)[0]?.amount).toBe(10)
  expect(hits(cast(setup(['ellipsis'], [['bite', V], ['you', S]])).events)[0]?.amount).toBe(6)
})

test('수식의 사슬: 목적어에 금이 간 2장 → 6 × 1.5 × 1.5 × 2 = 27', () => {
  const s = setup(['adjectiveChain'], [['bite', V], ['cracked', O, 0], ['cracked', O, 1]])
  expect(hits(cast(s).events)[0]?.amount).toBe(27)
  expect(sentenceFormula(s)[0]?.value).toBe(27)
})

test('강세: 격렬하게 ×2.25 → 13', () => {
  const s = setup(['stress'], [['bite', V], ['fiercely', V, 0]])
  expect(hits(cast(s).events)[0]?.amount).toBe(13)
  expect(sentenceFormula(s)[0]?.text).toBe('6 × 2.25 = 13')
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

test('긴 문장: 실행되지 않는 칸(자동사의 목적어)의 카드는 세지 않는다', () => {
  // 금이 간을 목적어에 깔고 숨는다(자동사)를 놓으면 목적어 칸은 꺼진다 → 실제로 실행되는 단어는 숨는다 1장.
  const s = setup(['longSentence'], [['cracked', O, 0], ['hide', V]])
  expect(clauseHooks(s, 0).supportBonus).toBe(2)
})

test('긴 문장: 연결어 카드도 문장에 놓인 단어로 센다', () => {
  let s = setup(['longSentence'], [['bite', V]])
  s = { ...s, deck: { ...s.deck, hand: [...s.deck.hand, { instanceId: 'c0', wordId: 'and' }, { instanceId: 'c1', wordId: 'bite' }] } }
  s = reduceRally(s, { type: 'connect', instanceId: 'c0' }, BALANCE).state
  s = reduceRally(s, { type: 'place', instanceId: 'c1', at: { clause: 1, role: 'verb' } }, BALANCE).state
  expect(clauseHooks(s, 0).damageBonus).toBe(6)
})

test('메아리 문구는 실제 동작(첫 절의 반복 횟수 +1)과 같다', () => {
  expect(RELICS.echo.text).toContain('반복 횟수 +1')
})

// ── 효과 데이터화 (Plan 7 Task 1) ──

/** 효과 정의에서 수치 필드만 뽑는다(문구에 그대로 나와야 하는 값). */
function amountsOf(effect: RelicEffect): number[] {
  return Object.entries(effect).flatMap(([key, value]) => (key !== 'kind' && typeof value === 'number' ? [value] : []))
}

test('모든 유물 정의는 effect를 갖고, 효과 문구에 effect의 수치가 들어 있다', () => {
  for (const relic of Object.values(RELICS)) {
    expect(relic.effect, relic.id).toBeDefined()
    for (const amount of amountsOf(relic.effect)) expect(relic.text, relic.id).toContain(String(amount))
  }
})

const context = { countedWords: 3, subjectBlank: true, clause: 0, clauseCount: 1 }

test('훅은 유물 id가 아니라 효과로 만든다: 같은 종류의 효과가 둘이면 더해진다', () => {
  const effects: RelicEffect[] = [
    { kind: 'perWordBonus', amount: 2 },
    { kind: 'perWordBonus', amount: 1 },
    { kind: 'blankSubjectBonus', amount: 4 },
  ]
  expect(hooksFromEffects(effects, context)).toEqual({ damageBonus: 3 * 3 + 4, supportBonus: 3 * 3 })
})

test('효과 종류마다 맞는 훅을 낸다', () => {
  expect(hooksFromEffects([{ kind: 'chainBoost', factor: 2, minAdjectives: 2 }], context)).toEqual({ chainBoost: { factor: 2, minAdjectives: 2 } })
  expect(hooksFromEffects([{ kind: 'adverbTwice' }], context)).toEqual({ adverbTwice: true })
  expect(hooksFromEffects([{ kind: 'poisonBonus', amount: 2 }], context)).toEqual({ poisonBonus: 2 })
  expect(hooksFromEffects([{ kind: 'soloRepeat', amount: 1 }], context)).toEqual({ repeatBonus: 1 })
  expect(hooksFromEffects([{ kind: 'soloRepeat', amount: 1 }], { ...context, clauseCount: 2 })).toEqual({})
  expect(hooksFromEffects([{ kind: 'blankSubjectBonus', amount: 4 }], { ...context, subjectBlank: false })).toEqual({})
})
