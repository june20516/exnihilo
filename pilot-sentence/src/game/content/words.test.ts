import { RALLY_STARTER_DECK } from './enemies'
import { getWord, type VerbAction, WORDS } from './words'

test.each([
  ['giant', 'cast', null],
  ['hungry', 'cast', null],
  ['cracked', 'enemyTurn', '금이 감'],
  ['blind', 'enemyTurn', '눈멂'],
  ['sturdy', 'enemyTurn', '단단함'],
  ['venomous', 'enemyTurn', '독을 뿜음'],
])('형용사 %s: 지속 %s, 상태 이름 %s (spec §4)', (id, lasts, stateName) => {
  expect(getWord(id).effect).toMatchObject({ type: 'adjective', lasts, stateName })
})

const blockOf = (id: string) => {
  const effect = getWord(id).effect
  const action = effect.type === 'verb' ? effect.actions.find((a): a is Extract<VerbAction, { kind: 'block' }> => a.kind === 'block') : undefined
  return action ? { amount: action.amount, holds: action.holds } : null
}

test.each([
  ['guard', 6, 1],
  ['hide', 10, 0],
  ['endure', 4, 3],
  ['curl', 8, 0],
  ['queenCurl', 10, 1],
  ['gateCurl', 20, 0],
])('보호 카드 속성 %s: 보호 %i, 이월 %i턴', (id, amount, holds) => {
  expect(blockOf(id)).toEqual({ amount, holds })
})

test('모든 동사는 공격 또는 지원으로 분류된다', () => {
  for (const word of Object.values(WORDS)) {
    if (word.effect.type === 'verb') expect(['attack', 'support'], word.id).toContain(word.effect.range)
  }
})

test('새 단어: 되받아친다·떠올린다·때린다', () => {
  expect(getWord('counter').effect).toMatchObject({ type: 'verb', range: 'attack', actions: [{ kind: 'counter' }] })
  expect(getWord('recall').effect).toMatchObject({ type: 'verb', range: 'support', actions: [{ kind: 'recall', amount: 4 }] })
  expect(getWord('strike')).toMatchObject({ text: '때린다', kind: 'verbTransitive', enemyOnly: true })
  expect(getWord('strike').effect).toMatchObject({ range: 'attack', actions: [{ kind: 'damage', amount: 3 }] })
})

test('시작 덱: 물어뜯는다 2장과 되받아친다 1장', () => {
  expect(RALLY_STARTER_DECK.filter((id) => id === 'counter')).toHaveLength(1)
  expect(RALLY_STARTER_DECK.filter((id) => id === 'bite')).toHaveLength(2)
})
