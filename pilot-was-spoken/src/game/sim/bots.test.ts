import type { SlotAddress } from '@/game/content/enemies'
import { BASIC_VERB_INSTANCE, type CardInst, type RallyAction, type RallyState, startRally } from '@/game/rally/combat'
import type { WordId } from '@/game/content/words'
import '@/game/rally/testFixtures'
import { isAttackOnlyAction } from './bots'

const V = { clause: 0, role: 'verb' } as const
const S = { clause: 0, role: 'subject' } as const
const withHand = (words: WordId[]): RallyState => {
  const base = startRally('test-dummy', ['bite', 'bite', 'bite', 'bite', 'bite', 'bite', 'bite', 'bite'], 1).state
  return { ...base, deck: { ...base.deck, hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) } }
}
const placeAt = (instanceId: string, at: SlotAddress = V): RallyAction => ({ type: 'place', instanceId, at })

test('isAttackOnlyAction: 피해 동사(물어뜯는다·때린다)는 true, 막는다·되받아친다·떠올린다·겁준다는 false', () => {
  const s = withHand(['bite', 'guard', 'counter', 'recall', 'scare'])
  expect(isAttackOnlyAction(s, placeAt('h0'))).toBe(true)
  expect(isAttackOnlyAction(s, placeAt(BASIC_VERB_INSTANCE))).toBe(true)
  expect(isAttackOnlyAction(s, placeAt('h1'))).toBe(false)
  expect(isAttackOnlyAction(s, placeAt('h2'))).toBe(false)
  expect(isAttackOnlyAction(s, placeAt('h3'))).toBe(false)
  expect(isAttackOnlyAction(s, placeAt('h4'))).toBe(false)
})

test('isAttackOnlyAction: 동사가 아닌 단어 배치와 낭독·턴 종료·대상 지정은 true', () => {
  const s = withHand(['giant', 'fiercely', 'you'])
  expect(isAttackOnlyAction(s, { type: 'place', instanceId: 'h0', at: S, modifierIndex: 0 })).toBe(true)
  expect(isAttackOnlyAction(s, { type: 'place', instanceId: 'h1', at: V, modifierIndex: 0 })).toBe(true)
  expect(isAttackOnlyAction(s, placeAt('h2', S))).toBe(true)
  expect(isAttackOnlyAction(s, { type: 'cast' })).toBe(true)
  expect(isAttackOnlyAction(s, { type: 'endTurn' })).toBe(true)
})
