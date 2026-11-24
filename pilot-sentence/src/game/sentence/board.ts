import type { ClauseSpec, SlotAddress } from '@/game/content/enemies'
import { getWord, type WordId } from '@/game/content/words'
import { type FrameId, FRAMES, MODIFIER_TARGET_ROLES, type SlotRole } from '@/game/grammar/frames'

export interface PlacedWord {
  readonly wordId: WordId
  /** blank: 내 문장의 빈칸(생략된 주어·목적어, 빈 동사). */
  readonly owner: 'player' | 'enemy' | 'blank'
  /** 플레이어 카드의 instanceId. 적 단어는 null. */
  readonly instanceId: string | null
  /** [지목]처럼 놓을 때 고른 대상. */
  readonly targetEntityId: string | null
}

export interface SlotState {
  readonly role: SlotRole
  readonly head: PlacedWord
  /** 길이는 maxModifiers로 고정. 빈칸은 null. */
  readonly modifiers: readonly (PlacedWord | null)[]
  readonly originalHead: PlacedWord
  readonly originalModifiers: readonly (PlacedWord | null)[]
  readonly sealed: boolean
}

export interface Clause {
  readonly frameId: FrameId
  readonly slots: readonly SlotState[]
}

export interface Board {
  readonly clauses: readonly Clause[]
}

export type PlaceResult =
  | { readonly ok: true; readonly board: Board; readonly displaced: PlacedWord[] }
  | { readonly ok: false; readonly reason: 'kindMismatch' | 'modifiersFull' | 'slotInactive' }

function enemyWord(wordId: WordId): PlacedWord {
  return { wordId, owner: 'enemy', instanceId: null, targetEntityId: null }
}

export function buildBoard(spec: readonly ClauseSpec[], maxModifiers: number): Board {
  return {
    clauses: spec.map((clauseSpec) => ({
      frameId: clauseSpec.frameId,
      slots: FRAMES[clauseSpec.frameId].slots.map((slotDef) => {
        const slotSpec = clauseSpec.slots.find((s) => s.role === slotDef.role)
        if (!slotSpec) throw new Error(`초기 문장에 ${slotDef.role} 슬롯이 없습니다.`)
        const modifiers = Array.from({ length: maxModifiers }, (_, i) => {
          const id = slotSpec.modifiers?.[i]
          return id === undefined ? null : enemyWord(id)
        })
        const head = enemyWord(slotSpec.head)
        return { role: slotDef.role, head, modifiers, originalHead: head, originalModifiers: modifiers, sealed: false }
      }),
    })),
  }
}

export function getSlot(board: Board, at: SlotAddress): SlotState {
  const slot = board.clauses[at.clause]?.slots.find((s) => s.role === at.role)
  if (!slot) throw new Error(`슬롯이 없습니다: ${at.clause}:${at.role}`)
  return slot
}

/** 목적어 슬롯은 같은 절의 동사가 타동사일 때만 활성이다(동사가 문형을 결정). */
export function isSlotActive(board: Board, at: SlotAddress): boolean {
  if (at.role !== 'object') return true
  const verb = board.clauses[at.clause]?.slots.find((s) => s.role === 'verb')
  return verb !== undefined && getWord(verb.head.wordId).kind === 'verbTransitive'
}

function updateSlot(board: Board, at: SlotAddress, update: (slot: SlotState) => SlotState): Board {
  return {
    clauses: board.clauses.map((clause, clauseIndex) =>
      clauseIndex !== at.clause
        ? clause
        : { ...clause, slots: clause.slots.map((slot) => (slot.role === at.role ? update(slot) : slot)) },
    ),
  }
}

function isModifierKind(kind: string): kind is 'adjective' | 'adverb' {
  return kind === 'adjective' || kind === 'adverb'
}

function slotAccepts(board: Board, at: SlotAddress, wordId: WordId): boolean {
  const frameId = board.clauses[at.clause]?.frameId
  if (!frameId) return false
  const slotDef = FRAMES[frameId].slots.find((s) => s.role === at.role)
  return slotDef?.accepts.includes(getWord(wordId).kind) ?? false
}

function withModifierAt(
  modifiers: readonly (PlacedWord | null)[],
  index: number,
  word: PlacedWord | null,
): (PlacedWord | null)[] {
  return modifiers.map((m, i) => (i === index ? word : m))
}

/** 플레이어 배치. 원문은 바꾸지 않는다. */
export function placeWord(board: Board, at: SlotAddress, word: PlacedWord, modifierIndex?: number): PlaceResult {
  const kind = getWord(word.wordId).kind
  const slot = getSlot(board, at)
  if (!isSlotActive(board, at)) return { ok: false, reason: 'slotInactive' }

  if (isModifierKind(kind)) {
    if (!MODIFIER_TARGET_ROLES[kind].includes(at.role)) return { ok: false, reason: 'kindMismatch' }
    const index = modifierIndex ?? slot.modifiers.findIndex((m) => m === null)
    if (index < 0 || index >= slot.modifiers.length) return { ok: false, reason: 'modifiersFull' }
    const previous = slot.modifiers[index]
    return {
      ok: true,
      board: updateSlot(board, at, (s) => ({ ...s, modifiers: withModifierAt(s.modifiers, index, word) })),
      displaced: previous ? [previous] : [],
    }
  }

  // 수식어 칸을 겨냥한 head 단어는 거부한다(강조되지 않은 칸에 놓았는데 head가 바뀌는 오동작 방지).
  if (modifierIndex !== undefined) return { ok: false, reason: 'kindMismatch' }
  if (!slotAccepts(board, at, word.wordId)) return { ok: false, reason: 'kindMismatch' }
  return {
    ok: true,
    board: updateSlot(board, at, (s) => ({ ...s, head: word })),
    displaced: [slot.head],
  }
}

/** 슬롯을 원문으로 되돌린다. 밀려난 단어(원문이 아닌 것)를 돌려준다. */
export function revertSlot(board: Board, at: SlotAddress): { board: Board; displaced: PlacedWord[] } {
  const slot = getSlot(board, at)
  const displaced: PlacedWord[] = []
  if (slot.head !== slot.originalHead) displaced.push(slot.head)
  slot.modifiers.forEach((modifier, index) => {
    if (modifier && modifier !== slot.originalModifiers[index]) displaced.push(modifier)
  })
  if (displaced.length === 0) return { board, displaced }
  return {
    board: updateSlot(board, at, (s) => ({ ...s, head: s.originalHead, modifiers: s.originalModifiers })),
    displaced,
  }
}

/**
 * 한 자리(head 또는 수식어 칸 하나)만 원문으로 되돌린다. 그 자리에 원문이 아닌 단어가 있었으면 그 단어를 돌려준다.
 * 같은 칸의 다른 자리(head를 빼면 수식어)는 그대로 둔다.
 */
export function revertOne(board: Board, at: SlotAddress, modifierIndex?: number): { board: Board; removed: PlacedWord | null } {
  const slot = getSlot(board, at)
  if (modifierIndex === undefined) {
    if (slot.head === slot.originalHead) return { board, removed: null }
    return { board: updateSlot(board, at, (s) => ({ ...s, head: s.originalHead })), removed: slot.head }
  }
  const current = slot.modifiers[modifierIndex]
  const original = slot.originalModifiers[modifierIndex] ?? null
  if (current === undefined || current === null || current === original) return { board, removed: null }
  return {
    board: updateSlot(board, at, (s) => ({ ...s, modifiers: s.modifiers.map((m, i) => (i === modifierIndex ? original : m)) })),
    removed: current,
  }
}

export function playerWordsOnBoard(board: Board): PlacedWord[] {
  return board.clauses.flatMap((clause) =>
    clause.slots.flatMap((slot) =>
      [slot.head, ...slot.modifiers].filter((w): w is PlacedWord => w !== null && w.owner === 'player'),
    ),
  )
}

/** 모든 슬롯을 원문으로 되돌린다(낭독 후 소비). 밀려난 단어를 돌려준다. */
export function revertAll(board: Board): { board: Board; displaced: PlacedWord[] } {
  let current = board
  const displaced: PlacedWord[] = []
  board.clauses.forEach((clause, clauseIndex) => {
    for (const slot of clause.slots) {
      const r = revertSlot(current, { clause: clauseIndex, role: slot.role })
      current = r.board
      displaced.push(...r.displaced)
    }
  })
  return { board: current, displaced }
}
