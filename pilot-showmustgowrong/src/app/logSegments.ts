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

/**
 * 한 글자 이름 바로 뒤에 올 수 있는 조사(긴 것 먼저)이고, 그 뒤에는 한글이 이어지지 않아야 한다.
 * "모습", "모두", "모이다", "모은다"처럼 조사 글자로 시작하는 낱말을 이름으로 오인하지 않는다.
 * 겹친 조사는 장소·상대 조사 뒤의 보조사("모에게는", "모한테도", "모로부터")만 허용한다. 주격·목적격 조사 뒤의
 * 보조사는 "모이는"(모이다)과 구분되지 않아 허용하지 않는다("모가는" 같은 문장은 없다).
 * 한계: 위 형태가 아닌 조사 조합이나 띄어쓰기 없이 한글이 붙는 문장("모가달려든다")은 칠하지 않는다.
 * 실제 로그 문구(content·narration)에는 이런 낱말이 없음을 확인했다(task-8 보고).
 */
const PARTICLE_AFTER_NAME =
  /^(?:(?:에게서|에게|에서|한테|으로|이랑|에|께|로|와|과)(?:는|은|도|만|까지|부터|요)?|(?:가|이|는|은|를|을|의|도|만)요?)(?![가-힣])/

const HANGUL = /[가-힣]/

function isNameAt(text: string, start: number, name: string): boolean {
  if (!text.startsWith(name, start)) return false
  // 앞이 한글이면 다른 낱말의 끝이다
  if (start > 0 && HANGUL.test(text[start - 1])) return false
  if ([...name].length > 1) return true
  const rest = text.slice(start + name.length)
  return rest === '' || !HANGUL.test(rest[0]) || PARTICLE_AFTER_NAME.test(rest)
}

/** 같은 색·흐림이 이어지는 조각을 하나로 합쳐 밀어 넣는다 */
function pushSegment(segments: LogSegment[], next: LogSegment): void {
  if (next.text === '') return
  const last = segments.at(-1)
  if (last !== undefined && last.color === next.color && last.dim === next.dim) last.text += next.text
  else segments.push(next)
}

/** 이름이 긴 것부터 놓는다. logSegments가 받는 목록은 이 순서여야 하므로 사람 목록을 만들 때 한 번만 부른다 */
export function sortPeopleLongestFirst(people: readonly LogPerson[]): LogPerson[] {
  return [...people].sort((a, b) => b.name.length - a.name.length)
}

function splitNames(text: string, byLength: readonly LogPerson[], dim: boolean): LogSegment[] {
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
 * 줄을 이름(출연자 색)과 나머지 글로 나눈다. people은 sortPeopleLongestFirst로 정렬된 목록이어야 하고
 * (정식 이름과 짧은 이름 중 긴 것이 먼저 잡힌다), 이름 뒤 조사는 이름에 넣지 않는다. leadIn(이어받은 앞머리)에 속한 조각은 dim이다.
 */
export function logSegments(line: LogLine, people: readonly LogPerson[]): LogSegment[] {
  const boundary = line.leadIn !== null && line.text.startsWith(line.leadIn) ? line.leadIn.length : 0
  const segments: LogSegment[] = []
  for (const segment of splitNames(line.text.slice(0, boundary), people, true)) pushSegment(segments, segment)
  for (const segment of splitNames(line.text.slice(boundary), people, false)) pushSegment(segments, segment)
  return segments
}
