import { type Entity, isAlive } from '@/kit/core/entity'
import type { ClauseSpec } from '@/game/content/enemies'
import { getWord, type WordId } from '@/game/content/words'
import { FRAMES, type SlotRole } from '@/game/grammar/frames'
import { type Board, buildBoard, type PlacedWord, type SlotState } from '@/game/sentence/board'

export const BLANK_SUBJECT: WordId = 'impliedSubject'
export const BLANK_OBJECT: WordId = 'impliedObject'
export const BLANK_VERB: WordId = 'blankVerb'

const BLANK_HEADS = { subject: BLANK_SUBJECT, object: BLANK_OBJECT, verb: BLANK_VERB } as const

function blankWord(wordId: WordId, targetEntityId: string | null = null): PlacedWord {
  return { wordId, owner: 'blank', inkLeft: null, instanceId: null, targetEntityId }
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

function slotOf(board: Board, role: SlotState['role']): SlotState {
  const slot = board.clauses[0]?.slots.find((s) => s.role === role)
  if (!slot) throw new Error(`내 문장에 ${role} 슬롯이 없습니다.`)
  return slot
}

export function hasVerb(board: Board): boolean {
  return !isBlank(slotOf(board, 'verb').head)
}

/** 동작에 보호나 회복이 있는 동사(방어 계열). */
export function isDefensiveVerb(wordId: WordId): boolean {
  const effect = getWord(wordId).effect
  return effect.type === 'verb' && effect.actions.some((a) => a.kind === 'block' || a.kind === 'heal')
}

/**
 * 빈칸을 실제 대상으로 채운다. 빈 주어는 당신, 빈 목적어는 지원 동사면 당신, 그 외에는 지정한 적.
 * 채운 단어도 빈칸(owner blank)으로 남겨 화면에서 흐리게 보일 수 있게 한다.
 */
export function materialize(board: Board, targetEnemyId: string | null, options: { impliedSubject?: WordId } = {}): Board {
  const verbEffect = getWord(slotOf(board, 'verb').head.wordId).effect
  const supportVerb = verbEffect.type === 'verb' && verbEffect.range === 'support'
  const fill = (slot: SlotState): SlotState => {
    if (!isBlank(slot.head)) return slot
    if (slot.role === 'subject') return { ...slot, head: blankWord(options.impliedSubject ?? 'you') }
    if (slot.role === 'object') return { ...slot, head: supportVerb ? blankWord('you') : blankWord('mark', targetEnemyId) }
    return slot
  }
  return { clauses: board.clauses.map((clause) => ({ ...clause, slots: clause.slots.map(fill) })) }
}

/** 적의 예고 문장. 주어를 그 적 하나로 고정한다(같은 종류의 적이 한꺼번에 행동하지 않도록). */
export function enemyBoard(spec: ClauseSpec, enemyId: string, maxModifiers: number): Board {
  const board = buildBoard([spec], maxModifiers)
  const self: PlacedWord = { wordId: 'mark', owner: 'enemy', inkLeft: null, instanceId: null, targetEntityId: enemyId }
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
