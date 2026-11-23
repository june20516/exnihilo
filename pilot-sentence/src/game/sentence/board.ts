import type { ClauseSpec, SlotAddress } from '@/game/content/encounters'
import { getWord, type WordId } from '@/game/content/words'
import { type FrameId, FRAMES, MODIFIER_TARGET_ROLES, type SlotRole } from '@/game/grammar/frames'

export interface PlacedWord {
  readonly wordId: WordId
  /** blank: 내 문장의 빈칸(생략된 주어·목적어, 빈 동사). */
  readonly owner: 'player' | 'enemy' | 'blank'
  /** 남은 실행 횟수. 적 단어는 null(마르지 않음). */
  readonly inkLeft: number | null
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
  return { wordId, owner: 'enemy', inkLeft: null, instanceId: null, targetEntityId: null }
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

export interface DriedWord {
  readonly at: SlotAddress
  readonly modifierIndex: number | null
  readonly word: PlacedWord
}

function tickInk(word: PlacedWord): PlacedWord {
  return word.inkLeft !== null ? { ...word, inkLeft: word.inkLeft - 1 } : word
}

function isDry(word: PlacedWord): boolean {
  return word.inkLeft !== null && word.inkLeft <= 0
}

/**
 * 잉크가 있는 단어(플레이어 단어, 뒤바꾸기로 옮겨진 단어)의 잉크를 1 줄이고, 다 마른 단어는 원문으로 되돌린다.
 * 원문 단어는 잉크가 없어(null) 마르지 않는다.
 */
export function dryInk(board: Board): { board: Board; dried: DriedWord[] } {
  const dried: DriedWord[] = []
  const clauses = board.clauses.map((clause, clauseIndex) => ({
    ...clause,
    slots: clause.slots.map((slot) => {
      const at = { clause: clauseIndex, role: slot.role }
      let head = tickInk(slot.head)
      if (isDry(head)) {
        dried.push({ at, modifierIndex: null, word: head })
        head = slot.originalHead
      }
      const modifiers = slot.modifiers.map((modifier, index) => {
        if (!modifier) return modifier
        const ticked = tickInk(modifier)
        if (!isDry(ticked)) return ticked
        dried.push({ at, modifierIndex: index, word: ticked })
        return slot.originalModifiers[index] ?? null
      })
      return { ...slot, head, modifiers }
    }),
  }))
  return { board: { clauses }, dried }
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

/** 적이 수식어를 붙인다. 첫 빈칸(없으면 맨 왼쪽)에 넣고 원문의 같은 위치도 갱신한다. */
export function enemyAttach(board: Board, at: SlotAddress, word: PlacedWord): { board: Board; displaced: PlacedWord[] } {
  const slot = getSlot(board, at)
  const emptyIndex = slot.modifiers.findIndex((m) => m === null)
  const index = emptyIndex >= 0 ? emptyIndex : 0
  const previous = slot.modifiers[index]
  return {
    board: updateSlot(board, at, (s) => ({
      ...s,
      modifiers: withModifierAt(s.modifiers, index, word),
      originalModifiers: withModifierAt(s.originalModifiers, index, word),
    })),
    displaced: previous ? [previous] : [],
  }
}

/** 적이 head를 교체한다. 원문도 함께 바뀐다. */
export function enemyReplace(board: Board, at: SlotAddress, word: PlacedWord): { board: Board; displaced: PlacedWord[] } {
  const slot = getSlot(board, at)
  return {
    board: updateSlot(board, at, (s) => ({ ...s, head: word, originalHead: word })),
    displaced: [slot.head],
  }
}

export function sealSlot(board: Board, at: SlotAddress): Board {
  return updateSlot(board, at, (s) => ({ ...s, sealed: true }))
}

export function playerWordsOnBoard(board: Board): PlacedWord[] {
  return board.clauses.flatMap((clause) =>
    clause.slots.flatMap((slot) =>
      [slot.head, ...slot.modifiers].filter((w): w is PlacedWord => w !== null && w.owner === 'player'),
    ),
  )
}

/**
 * 절의 주어와 목적어 명사구(head + 수식어)를 맞바꾼다. 원문과 봉인은 슬롯에 그대로 남는다.
 * movedInk가 주어지면(잉크 건조 프리셋) 잉크가 없던 단어도 그만큼 실행된 뒤 원문으로 돌아간다.
 */
export function swapNounPhrases(board: Board, clause: number, movedInk: number | null = null): Board {
  const withInk = (word: PlacedWord): PlacedWord => (movedInk !== null && word.inkLeft === null ? { ...word, inkLeft: movedInk } : word)
  const move = (slot: SlotState) => ({
    head: withInk(slot.head),
    modifiers: slot.modifiers.map((m) => (m ? withInk(m) : m)),
  })
  const subject = move(getSlot(board, { clause, role: 'subject' }))
  const object = move(getSlot(board, { clause, role: 'object' }))
  const swapped = updateSlot(board, { clause, role: 'subject' }, (s) => ({ ...s, ...object }))
  return updateSlot(swapped, { clause, role: 'object' }, (s) => ({ ...s, ...subject }))
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
