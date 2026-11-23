import { getWord } from '@/game/content/words'
import { describeIntent, describeWord, ROLE_NAMES } from './describe'

const roleName = (r: keyof typeof ROLE_NAMES) => ROLE_NAMES[r]

test.each([
  ['bite', '피해 6 (근접)'],
  ['fiercely', '동사 위력 ×1.5'],
  ['blind', '주는 피해 ×0.5'],
  ['web', '사용할 수 없다'],
  ['guard', '주어에게 보호 6'],
  ['mend', '목적어 회복 5'],
  ['venomous', '피해를 주면 독 2'],
  ['scarecrow', '허수아비(HP 8)를 불러낸다'],
  ['mark', '적 하나를 가리킨다'],
  ['sleep', '주어가 다음 행동을 못 한다 (자동사)'],
])('describeWord(%s)', (id, expected) => {
  expect(describeWord(getWord(id))).toBe(expected)
})

test('describeIntent', () => {
  expect(describeIntent({ kind: 'revert', at: { clause: 0, role: 'subject' } }, roleName)).toBe('↺ 주어를 원문으로 되돌림')
  expect(describeIntent({ kind: 'attach', at: { clause: 0, role: 'verb' }, word: 'fiercely' }, roleName))
    .toBe('＋ 동사에 [격렬하게]를 붙임')
  expect(describeIntent({ kind: 'pollute', word: 'web', count: 1 }, roleName)).toBe('☠ 덱에 [거미줄] 1장')
  expect(describeIntent({ kind: 'seal', at: { clause: 0, role: 'object' } }, roleName)).toBe('🔒 목적어를 봉인')
  expect(describeIntent({ kind: 'replace', at: { clause: 0, role: 'object' }, word: 'spider' }, roleName))
    .toBe('✎ 목적어를 [거미]로 교체')
})
