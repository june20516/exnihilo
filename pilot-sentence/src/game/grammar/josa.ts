export type ParticleKind = 'subject' | 'object' | 'topic' | 'and' | 'dative' | 'dativeFrom'

const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
const FINAL_CONSONANT_COUNT = 28

/** 숫자를 한국어로 읽었을 때 받침이 있는 자리: 영, 일, 삼, 육, 칠, 팔. */
const DIGITS_WITH_FINAL = new Set(['0', '1', '3', '6', '7', '8'])

/**
 * 마지막 글자가 받침 있는 한글 음절이거나, 한국어로 읽어 받침이 있는 숫자면 true.
 * 그 밖의 글자나 빈 문자열은 false.
 */
export function hasFinalConsonant(word: string): boolean {
  const lastChar = word.at(-1)
  if (lastChar === undefined) return false
  if (lastChar >= '0' && lastChar <= '9') return DIGITS_WITH_FINAL.has(lastChar)
  const code = lastChar.charCodeAt(0)
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return false
  return (code - HANGUL_FIRST) % FINAL_CONSONANT_COUNT !== 0
}

const PARTICLES: Record<ParticleKind, { withFinal: string; withoutFinal: string }> = {
  subject: { withFinal: '이', withoutFinal: '가' },
  object: { withFinal: '을', withoutFinal: '를' },
  topic: { withFinal: '은', withoutFinal: '는' },
  and: { withFinal: '과', withoutFinal: '와' },
  dative: { withFinal: '에게', withoutFinal: '에게' },
  dativeFrom: { withFinal: '에게서', withoutFinal: '에게서' },
}

export function attachParticle(word: string, kind: ParticleKind): string {
  const forms = PARTICLES[kind]
  return word + (hasFinalConsonant(word) ? forms.withFinal : forms.withoutFinal)
}
