import { PLAYER_POOL } from '@/game/content/words'
import { getWord } from '@/game/content/words'
import { blockText, describeWord } from './describe'

test.each([
  ['bite', '피해 6'],
  ['fiercely', '동사 위력 ×1.5'],
  ['blind', '주는 피해 ×0.5 · 적 차례까지'],
  ['guard', '주어에게 보호 6 · 1턴 유지'],
  ['mend', '목적어 회복 6'],
  ['devour', '피해 5, 준 만큼 회복'],
  ['sacrifice', '주어 HP −6, 피해 15'],
  ['rage', '주어에게 힘 +2 (자동사)'],
  ['scare', '목적어에게 약화 2'],
  ['twice', '동사를 2번 실행'],
  ['again', '지금까지 실행 횟수만큼 위력 +1'],
  ['hungry', '주는 피해 +4, 실행 후 자신 HP −2 · 이번 낭독'],
  ['sturdy', '받는 피해 −3 · 적 차례까지'],
  ['allies', '나와 아군 전원을 가리킨다'],
  ['everyone', '적까지 포함한 전원을 가리킨다'],
  ['venomous', '피해를 주면 독 2 · 적 차례까지'],
  ['giant', '주는 피해 ×1.5 · 이번 낭독'],
  ['cracked', '받는 피해 ×1.5 · 적 차례까지'],
  ['scarecrow', '허수아비(HP 8)를 불러낸다'],
  ['mark', '적 하나를 가리킨다'],
  ['sleep', '주어가 다음 행동을 못 한다 (자동사)'],
  ['web', '사용할 수 없다'],
  ['hide', '주어에게 보호 10 (자동사)'],
  ['endure', '주어에게 보호 4 · 3턴 유지 (자동사)'],
  ['counter', '주어의 보호만큼 피해, 보호를 모두 씀'],
  ['recall', '망각에서 4장을 서고로 (자동사)'],
  ['strike', '피해 3'],
])('describeWord(%s)', (id, expected) => {
  expect(describeWord(getWord(id))).toBe(expected)
})

test('v2에는 잉크·비용이 없다: 어떤 카드 설명에도 잉크가 나오지 않는다', () => {
  for (const word of PLAYER_POOL) expect(describeWord(word), word.id).not.toContain('잉크')
})

test('근접·원거리 표기는 어떤 카드 설명에도 없다', () => {
  for (const word of PLAYER_POOL) expect(describeWord(word), word.id).not.toMatch(/근접|원거리/)
})

test('blockText: 보호 합과 이월 몫(남은 턴)을 보인다', () => {
  expect(blockText([{ amount: 6, turnsLeft: 0 }, { amount: 4, turnsLeft: 2 }])).toBe('보호 10 · 4는 2턴 유지')
  expect(blockText([{ amount: 9, turnsLeft: 0 }])).toBe('보호 9')
  expect(blockText([])).toBe('')
})
