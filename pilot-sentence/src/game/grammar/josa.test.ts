import { attachParticle, hasFinalConsonant, type ParticleKind } from './josa'

test.each([
  ['거미', 'subject', '거미가'],
  ['당신', 'subject', '당신이'],
  ['거미', 'object', '거미를'],
  ['당신', 'object', '당신을'],
  ['거미', 'and', '거미와'],
  ['당신', 'and', '당신과'],
  ['허수아비', 'topic', '허수아비는'],
  ['마녀', 'dativeFrom', '마녀에게서'],
  ['마녀', 'dative', '마녀에게'],
  ['HP', 'subject', 'HP가'],
  ['', 'object', '를'],
])('%s + %s → %s', (word, kind, expected) => {
  expect(attachParticle(word, kind as ParticleKind)).toBe(expected)
})

test('받침 판정은 마지막 글자만 본다', () => {
  expect(hasFinalConsonant('용암 동굴')).toBe(true)
  expect(hasFinalConsonant('3')).toBe(true)
  expect(hasFinalConsonant('abc')).toBe(false)
})

test('숫자로 끝나면 한국어 독음의 받침으로 판정한다', () => {
  expect(attachParticle('새끼 거미 1', 'subject')).toBe('새끼 거미 1이')
  expect(attachParticle('새끼 거미 2', 'subject')).toBe('새끼 거미 2가')
  expect(attachParticle('새끼 거미 3', 'object')).toBe('새끼 거미 3을')
  expect(attachParticle('새끼 거미 4', 'object')).toBe('새끼 거미 4를')
  for (const d of ['0', '1', '3', '6', '7', '8']) expect(hasFinalConsonant(`x${d}`)).toBe(true)
  for (const d of ['2', '4', '5', '9']) expect(hasFinalConsonant(`x${d}`)).toBe(false)
})
