import { TEMPLATE_TOKEN } from '@/content/templateTokens'
import type {
  BurstAction,
  EmotionDef,
  HabitDef,
  PhenomenonKind,
} from '@/content/types'
import { withObject, withPartner, withSubject } from './describe'
import type { Reason } from './emotion'

/** 사건 이유의 기본 명사. label이 없는 사건에 쓴다 */
export const KIND_NOUNS: Record<Exclude<PhenomenonKind, 'gaze' | 'silence'>, string> = {
  noise: '소란',
  laughter: '웃음',
  anger: '화',
  impact: '충돌',
  darkness: '어둠',
  exposure: '민망한 모습',
}

/** 쌓임 문형에 쓰는 이유의 최대 개수 */
const MAX_ACCUMULATED_REASONS = 2

/** KIND_NOUNS에 없는 종류의 명사. 사건 이유로 올 일은 드물지만 throw하지 않고 읽히게 한다 */
export const EXTRA_KIND_NOUNS: Record<'gaze' | 'silence', string> = {
  gaze: '시선',
  silence: '정적',
}

function kindNoun(kind: PhenomenonKind): string {
  return kind === 'gaze' || kind === 'silence' ? EXTRA_KIND_NOUNS[kind] : KIND_NOUNS[kind]
}

function applyParticle(word: string, particle: string | undefined): string {
  switch (particle) {
    case '을':
      return withObject(word)
    case '와':
      return withPartner(word)
    case undefined:
      return word
    default:
      // 에·에게는 받침과 무관하다
      return `${word}${particle}`
  }
}

/**
 * {target}·{reasons}와 조사 붙은 토큰을 채운다. 을/와는 받침에 따라 바꾸고 에·에게는 그대로 붙인다.
 * 값이 없는 토큰은 호출자의 문형 선택 오류이므로 throw한다.
 */
export function fillTemplate(template: string, values: { target?: string; reasons?: string }): string {
  return template.replace(TEMPLATE_TOKEN, (_token, name: 'target' | 'reasons', particle?: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`문형 토큰 {${name}}의 값이 없습니다: ${template}`)
    return applyParticle(value, particle)
  })
}

/** 이유의 출처 이름표. relief는 이름표가 없다(양수 이유만 넘겨야 한다) */
export function reasonNoun(reason: Reason, nameOf: (id: string) => string): string {
  const { source } = reason
  switch (source.type) {
    case 'event': {
      const { event } = source
      const noun = event.label ?? kindNoun(event.kind)
      return event.sourceId === '' ? noun : `${nameOf(event.sourceId)}의 ${noun}`
    }
    case 'situation':
      return source.label.noun
    case 'directive':
      return `PD의 '${source.label}'`
    case 'relief':
      throw new Error('relief 이유에는 명사가 없습니다')
  }
}

/** '아까 코를 파던 렉스가' 또는 '렉스가' */
export function subjectPhrase(name: string, recall: HabitDef | null): string {
  const subject = withSubject(name)
  return recall === null ? subject : `아까 ${recall.recall} ${subject}`
}

/** 대상이 있고 targetLine이 있으면 targetLine, 아니면 line */
function predicate(action: { line: string; targetLine?: string }, targetName: string | null): string {
  if (targetName !== null && action.targetLine !== undefined) {
    return fillTemplate(action.targetLine, { target: targetName })
  }
  return action.line
}

export function habitLine(
  name: string,
  habit: HabitDef,
  targetName: string | null,
  received: { sourceName: string; noun: string } | null,
): string {
  const body = `${withSubject(name)} ${predicate(habit, targetName)}`
  return received === null ? body : `${received.sourceName}의 ${received.noun}에 ${body}`
}

export function stageLine(name: string, recall: HabitDef | null, emotion: EmotionDef, stage: 1 | 2): string {
  return `${subjectPhrase(name, recall)} ${emotion.stageLines[stage - 1]}`
}

/** 터짐 줄. 쌓임이 회상보다 앞서므로 이유가 있으면 회상은 쓰지 않는다 */
export function burstLine(
  name: string,
  recall: HabitDef | null,
  emotion: EmotionDef,
  burst: BurstAction,
  targetName: string | null,
  intense: boolean,
  top: readonly Reason[],
  nameOf: (id: string) => string,
): string {
  const action =
    intense && burst.intenseLine !== undefined ? burst.intenseLine : predicate(burst, targetName)
  return `${burstSubject(name, recall, emotion, top, nameOf)} ${action}`
}

function burstSubject(
  name: string,
  recall: HabitDef | null,
  emotion: EmotionDef,
  top: readonly Reason[],
  nameOf: (id: string) => string,
): string {
  const first = top[0]
  if (first === undefined) return subjectPhrase(name, recall)
  switch (first.source.type) {
    case 'situation':
      return `${first.source.label.clause} ${withSubject(name)}`
    case 'directive':
      return `${reasonNoun(first, nameOf)}에 ${withSubject(name)}`
    case 'relief':
      throw new Error('relief 이유는 터짐 주어를 만들 수 없습니다')
    case 'event': {
      const nouns = top.slice(0, MAX_ACCUMULATED_REASONS).map((reason) => reasonNoun(reason, nameOf))
      const joined =
        nouns.length === 2 ? `${withPartner(nouns[0])} ${nouns[1]}` : nouns[0]
      return `${fillTemplate(emotion.accumulate, { reasons: joined })} ${withSubject(name)}`
    }
  }
}
