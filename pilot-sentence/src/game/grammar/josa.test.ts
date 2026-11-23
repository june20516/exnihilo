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

test('받침 판정은 마지막 한글 음절만 본다', () => {
  expect(hasFinalConsonant('용암 동굴')).toBe(true)
  expect(hasFinalConsonant('3')).toBe(false)
})
