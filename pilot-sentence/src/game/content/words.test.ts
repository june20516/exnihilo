import { getWord } from './words'

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
