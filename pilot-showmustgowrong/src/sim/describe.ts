import type { StirKind } from '@/content/types'
import { canBeStir, type PhenomenonEvent } from './phenomena'

const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
const FINAL_CONSONANT_COUNT = 28

/** 고정 환경 source의 이름. shortNames에 같은 id가 있으면 그쪽이 우선한다. */
const BUILT_IN_NAMES: Record<string, string> = {
  audience: '관객',
  broadcast: '방송',
}

/** 로그에 쓰는 이름. shortNames(출연자·스태프 shortName, 장비 name, 카메라 label), 고정 환경 이름, id 순으로 찾는다. */
export function entityName(id: string, shortNames: Record<string, string>): string {
  return knownEntityName(id, shortNames) ?? id
}

/** shortNames나 고정 환경 이름에 있는 이름. 어디에도 없으면 null이다(entityName처럼 id로 대신하지 않는다). */
export function knownEntityName(id: string, shortNames: Record<string, string>): string | null {
  return shortNames[id] ?? BUILT_IN_NAMES[id] ?? null
}

/** 받침 판정에서 건너뛰는 끝 기호(닫는 따옴표·괄호, 문장 부호). "PD의 '반박하세요'"는 '요'로 판단한다. */
const TRAILING_SYMBOLS = /['"’”)\]}」』〉》!?.…~]+$/

/** 끝 글자(끝 기호를 뺀)의 받침 유무. 한글이 아니면 null. */
function hasFinalConsonant(word: string): boolean | null {
  const stem = word.replace(TRAILING_SYMBOLS, '')
  const code = stem.charCodeAt(stem.length - 1)
  if (Number.isNaN(code) || code < HANGUL_FIRST || code > HANGUL_LAST) return null
  return (code - HANGUL_FIRST) % FINAL_CONSONANT_COUNT !== 0
}

function attach(word: string, withFinal: string, withoutFinal: string): string {
  const final = hasFinalConsonant(word)
  if (final === null) return `${word}${withFinal}(${withoutFinal})`
  return `${word}${final ? withFinal : withoutFinal}`
}

/** 주격 조사 이/가 */
export function withSubject(word: string): string {
  return attach(word, '이', '가')
}

/** 목적격 조사 을/를 */
export function withObject(word: string): string {
  return attach(word, '을', '를')
}

/** 접속 조사 와/과 */
export function withPartner(word: string): string {
  return attach(word, '과', '와')
}

const STIR_NOUNS: Record<StirKind, string> = {
  noise: '기척 소리',
  laughter: '웃음 기척',
  anger: '짜증 기척',
  exposure: '드러남 기척',
}

/**
 * 정산의 뿌리 줄 문구. 강도 1 이상은 describeEvent 문장이다. 기척은 문장이 없으므로
 * "<출처 이름>의 <label 또는 종류 명사>"를 쓰고, 출처 이름을 shortNames에서 찾지 못하면 명사만 쓴다.
 * 어느 경우에도 throw하지 않는다.
 */
export function describeRootEvent(
  event: PhenomenonEvent,
  shortNames: Record<string, string>,
): string {
  if (event.intensity !== 0) return describeEvent(event, shortNames)
  const noun = event.label ?? (canBeStir(event.kind) ? STIR_NOUNS[event.kind] : '기척')
  const sourceName = knownEntityName(event.sourceId, shortNames)
  return sourceName === null ? noun : `${sourceName}의 ${noun}`
}

/** 사고 로그 한 줄. 이름은 shortNames(출연자·스태프 shortName, 장비 name, 카메라 label)에서 찾는다. */
export function describeEvent(event: PhenomenonEvent, shortNames: Record<string, string>): string {
  if (event.intensity === 0) throw new Error('기척은 문장이 없습니다')
  const nameOf = (id: string): string => entityName(id, shortNames)
  const source = nameOf(event.sourceId)
  const target = event.targetId === null ? null : nameOf(event.targetId)

  switch (event.kind) {
    case 'impact':
      return target === null
        ? `${withSubject(source)} 쾅 하고 부딪혔다!`
        : `${withSubject(source)} ${withPartner(target)} 부딪혔다!`
    case 'laughter':
      if (target !== null) return `${withSubject(source)} ${withObject(target)} 보고 웃는다`
      return event.intensity === 3
        ? `${withSubject(source)} 배를 잡고 웃는다`
        : `${withSubject(source)} 웃음을 터뜨린다`
    case 'anger': {
      if (event.intensity === 3) return `${withSubject(source)} 욕설을 했다! (삐—)`
      const outburst = event.intensity === 2 ? '버럭 화를 낸다' : '투덜댄다'
      return target === null
        ? `${withSubject(source)} ${outburst}`
        : `${withSubject(source)} ${target}에게 ${outburst}`
    }
    case 'noise': {
      const sound = { 1: '소리가 난다', 2: '큰 소리가 난다!', 3: '굉음이 울린다!' }[event.intensity]
      return `${source} 쪽에서 ${sound}`
    }
    case 'darkness':
      return `${withSubject(source)} 꺼지고 주위가 어두워졌다!`
    case 'exposure':
      return target === null
        ? `${source} 쪽에서 보여선 안 될 것이 드러났다!`
        : `${withSubject(target)} 민망한 모습을 드러냈다!`
    case 'silence':
      return {
        1: '방송에 정적이 흐른다…',
        2: '방송에 어색한 정적이 이어진다…',
        3: '방송이 얼어붙었다…',
      }[event.intensity]
    case 'gaze':
      if (target === null) return `${withSubject(source)} 화면을 비춘다`
      return event.sourceId === 'broadcast'
        ? `${withSubject(target)} 한동안 화면에 잡히지 않았다`
        : `${withSubject(source)} ${withObject(target)} 잡았다`
  }
}
