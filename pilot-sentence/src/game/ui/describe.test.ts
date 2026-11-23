import { getWord } from '@/game/content/words'
import { describeIntent, describeWord, ROLE_NAMES } from './describe'

const roleName = (r: keyof typeof ROLE_NAMES) => ROLE_NAMES[r]

test.each([
  ['bite', '피해 6 (근접)'],
  ['fiercely', '동사 위력 ×1.5'],
  ['blind', '주는 피해 ×0.5'],
  ['guard', '주어에게 보호 6'],
  ['mend', '목적어 회복 6'],
  ['devour', '피해 5, 준 만큼 회복 (근접)'],
  ['sacrifice', '주어 HP −6, 피해 15 (원거리)'],
  ['rage', '주어에게 힘 +2 (자동사)'],
  ['scare', '목적어에게 약화 2 (원거리)'],
  ['twice', '동사를 2번 실행'],
  ['again', '지금까지 실행 횟수만큼 위력 +1'],
  ['hungry', '주는 피해 +4, 실행 후 자신 HP −2'],
  ['sturdy', '받는 피해 −3'],
  ['allies', '나와 아군 전원을 가리킨다'],
  ['everyone', '적까지 포함한 전원을 가리킨다'],
  ['venomous', '피해를 주면 독 2'],
  ['scarecrow', '허수아비(HP 8)를 불러낸다'],
  ['mark', '적 하나를 가리킨다'],
  ['sleep', '주어가 다음 행동을 못 한다 (자동사)'],
  ['web', '사용할 수 없다'],
])('describeWord(%s)', (id, expected) => {
  expect(describeWord(getWord(id))).toBe(expected)
})

test('describeIntent', () => {
  expect(describeIntent({ kind: 'revert', at: { clause: 0, role: 'subject' } }, roleName)).toBe('↺ 주어를 원문으로 되돌림')
  expect(describeIntent({ kind: 'attach', at: { clause: 0, role: 'verb' }, word: 'fiercely' }, roleName))
    .toBe('＋ 동사에 [격렬하게]를 붙임')
  expect(describeIntent({ kind: 'pollute', word: 'web', count: 1 }, roleName)).toBe('☠ 덱에 [거미줄] 1장')
  expect(describeIntent({ kind: 'enrage' }, roleName)).toBe('🔥 격앙: 이후 매 턴 두 번 개입')
  expect(describeIntent({ kind: 'seal', at: { clause: 0, role: 'object' } }, roleName)).toBe('🔒 목적어를 봉인')
  expect(describeIntent({ kind: 'replace', at: { clause: 0, role: 'object' }, word: 'spider' }, roleName))
    .toBe('✎ 목적어를 [거미]로 교체')
})
