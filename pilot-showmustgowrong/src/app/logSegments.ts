import type { LogLine } from '@/sim/engine'

/** 줄 속 이름을 칠할 출연자(정식 이름과 짧은 이름을 각각 한 항목으로 넘긴다) */
export interface LogPerson {
  name: string
  color: string
}

/** 줄을 이루는 조각 하나. color가 null이면 이름이 아닌 글이다 */
export interface LogSegment {
  text: string
  color: string | null
  /** 이어받은 사고 줄의 앞머리(흐리게 보인다) */
  dim: boolean
}

/** 한 글자 이름 뒤에 올 수 있는 조사. "모습", "모두" 같은 낱말 속 글자와 구분한다 */
const PARTICLES = ['가', '이', '는', '은', '를', '을', '의', '와', '과', '도', '에', '한테', '께', '로', '만']

const HANGUL = /[가-힣]/

function isNameAt(text: string, start: number, name: string): boolean {
  if (!text.startsWith(name, start)) return false
  // 앞이 한글이면 다른 낱말의 끝이다
  if (start > 0 && HANGUL.test(text[start - 1])) return false
  if ([...name].length > 1) return true
  const rest = text.slice(start + name.length)
  return rest === '' || !HANGUL.test(rest[0]) || PARTICLES.some((particle) => rest.startsWith(particle))
}

/** 같은 색·흐림이 이어지는 조각을 하나로 합쳐 밀어 넣는다 */
function pushSegment(segments: LogSegment[], next: LogSegment): void {
  if (next.text === '') return
  const last = segments.at(-1)
  if (last !== undefined && last.color === next.color && last.dim === next.dim) last.text += next.text
  else segments.push(next)
}

function splitNames(text: string, people: readonly LogPerson[], dim: boolean): LogSegment[] {
  const byLength = [...people].sort((a, b) => b.name.length - a.name.length)
  const segments: LogSegment[] = []
  let cursor = 0
  while (cursor < text.length) {
    const person = byLength.find((candidate) => candidate.name !== '' && isNameAt(text, cursor, candidate.name))
    if (person === undefined) {
      pushSegment(segments, { text: text[cursor], color: null, dim })
      cursor += 1
    } else {
      pushSegment(segments, { text: person.name, color: person.color, dim })
      cursor += person.name.length
    }
  }
  return segments
}

/**
 * 줄을 이름(출연자 색)과 나머지 글로 나눈다. 이름은 정식 이름과 짧은 이름 중 긴 것이 먼저 잡히고,
 * 이름 뒤 조사는 이름에 넣지 않는다. leadIn(이어받은 앞머리)에 속한 조각은 dim이다.
 */
export function logSegments(line: LogLine, people: readonly LogPerson[]): LogSegment[] {
  const boundary = line.leadIn !== null && line.text.startsWith(line.leadIn) ? line.leadIn.length : 0
  const segments: LogSegment[] = []
  for (const segment of splitNames(line.text.slice(0, boundary), people, true)) pushSegment(segments, segment)
  for (const segment of splitNames(line.text.slice(boundary), people, false)) pushSegment(segments, segment)
  return segments
}
