import { type Entity, isAlive } from '@/kit/core/entity'
import type { ClauseSpec } from '@/game/content/enemies'
import { getWord, type WordId } from '@/game/content/words'
import { FRAMES, type SlotRole } from '@/game/grammar/frames'
import { type Board, buildBoard, type Clause, type PlacedWord, type SlotState } from '@/game/sentence/board'

export const BLANK_SUBJECT: WordId = 'impliedSubject'
export const BLANK_OBJECT: WordId = 'impliedObject'
export const BLANK_VERB: WordId = 'blankVerb'

const BLANK_HEADS = { subject: BLANK_SUBJECT, object: BLANK_OBJECT, verb: BLANK_VERB } as const

function blankWord(wordId: WordId, targetEntityId: string | null = null): PlacedWord {
  return { wordId, owner: 'blank', instanceId: null, targetEntityId }
}

export function isBlank(word: PlacedWord): boolean {
  return word.owner === 'blank'
}

/** 매 턴 시작하는 내 문장: 빈 주어·빈 목적어·빈 동사, 수식어 칸은 슬롯별 칸 수만큼 비어 있다. */
export function blankSentence(slotCounts: Readonly<Record<SlotRole, number>>): Board {
  const slots: SlotState[] = FRAMES.transitive.slots.map((slotDef) => {
    const head = blankWord(BLANK_HEADS[slotDef.role])
    const modifiers = Array.from({ length: slotCounts[slotDef.role] }, () => null)
    return { role: slotDef.role, head, modifiers, originalHead: head, originalModifiers: modifiers, sealed: false }
  })
  return { clauses: [{ frameId: 'transitive', slots }] }
}

function slotOf(board: Board, role: SlotState['role'], clause = 0): SlotState {
  const slot = board.clauses[clause]?.slots.find((s) => s.role === role)
  if (!slot) throw new Error(`내 문장 ${clause}절에 ${role} 슬롯이 없습니다.`)
  return slot
}

/** 모든 절에 동사가 놓였는가(연결어로 둘째 절을 열었다면 둘째 절에도). */
export function hasVerb(board: Board): boolean {
  return board.clauses.every((_, clause) => !isBlank(slotOf(board, 'verb', clause).head))
}

/** 빈 문장 한 절(연결어로 둘째 절을 열 때 쓴다). */
export function blankClause(slotCounts: Readonly<Record<SlotRole, number>>): Clause {
  const [clause] = blankSentence(slotCounts).clauses
  return clause
}

/** 동작에 보호나 회복이 있는 동사(방어 계열). */
export function isDefensiveVerb(wordId: WordId): boolean {
  const effect = getWord(wordId).effect
  return effect.type === 'verb' && effect.actions.some((a) => a.kind === 'block' || a.kind === 'heal')
}

export interface MaterializeOptions {
  /** 생략된 주어를 채울 단어(허수아비 화자). 기본 당신. */
  readonly impliedSubject?: WordId
  /** 그러면서: 절 1의 슬롯별 수식어를 절 2의 같은 슬롯에도 덧붙인다. */
  readonly borrowModifiers?: boolean
}

/**
 * 빈칸을 실제 대상으로 채운다. 빈 주어는 당신, 빈 목적어는 그 절의 동사가 지원 계열이면 당신, 그 외에는 지정한 적.
 * 채운 단어도 빈칸(owner blank)으로 남겨 화면에서 흐리게 보일 수 있게 한다. 결과는 실행용이며 상태에 저장하지 않는다.
 */
export function materialize(board: Board, targetEnemyId: string | null, options: MaterializeOptions = {}): Board {
  const clauses = board.clauses.map((clause, clauseIndex) => {
    const verbEffect = getWord(slotOf(board, 'verb', clauseIndex).head.wordId).effect
    const supportVerb = verbEffect.type === 'verb' && verbEffect.range === 'support'
    const fill = (slot: SlotState): SlotState => {
      const borrowed = options.borrowModifiers && clauseIndex > 0
        ? slotOf(board, slot.role, 0).modifiers.filter((m): m is PlacedWord => m !== null)
        : []
      const withBorrowed = borrowed.length > 0 ? { ...slot, modifiers: [...slot.modifiers, ...borrowed] } : slot
      if (!isBlank(slot.head)) return withBorrowed
      if (slot.role === 'subject') return { ...withBorrowed, head: blankWord(options.impliedSubject ?? 'you') }
      if (slot.role === 'object') {
        return { ...withBorrowed, head: supportVerb ? blankWord('you') : blankWord('mark', targetEnemyId) }
      }
      return withBorrowed
    }
    return { ...clause, slots: clause.slots.map(fill) }
  })
  return { clauses }
}

/** 적의 예고 문장. 주어를 그 적 하나로 고정한다(같은 종류의 적이 한꺼번에 행동하지 않도록). */
export function enemyBoard(spec: ClauseSpec, enemyId: string, maxModifiers: number): Board {
  const board = buildBoard([spec], maxModifiers)
  const self: PlacedWord = { wordId: 'mark', owner: 'enemy', instanceId: null, targetEntityId: enemyId }
  return {
    clauses: board.clauses.map((clause) => ({
      ...clause,
      slots: clause.slots.map((slot) => (slot.role === 'subject' ? { ...slot, head: self, originalHead: self } : slot)),
    })),
  }
}

export function firstAliveEnemy(entities: readonly Entity[]): string | null {
  return entities.find((e) => e.side === 'enemy' && isAlive(e))?.id ?? null
}
