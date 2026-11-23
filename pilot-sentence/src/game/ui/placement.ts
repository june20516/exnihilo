import type { SlotAddress } from '@/game/content/enemies'
import { getWord, type WordId } from '@/game/content/words'
import { MODIFIER_TARGET_ROLES, type SlotRole } from '@/game/grammar/frames'
import { type Board, placeWord } from '@/game/sentence/board'

export function isModifierWord(wordId: WordId): boolean {
  const kind = getWord(wordId).kind
  return kind === 'adjective' || kind === 'adverb'
}

/** 선택한 단어를 이 슬롯의 head에 놓을 수 있는가. */
export function canPlaceHead(board: Board, at: SlotAddress, wordId: WordId): boolean {
  if (isModifierWord(wordId) || getWord(wordId).kind === 'junk') return false
  return placeWord(board, at, { wordId, owner: 'player', instanceId: null, targetEntityId: null }).ok
}

/** 선택한 단어를 이 슬롯의 수식어 칸에 놓을 수 있는가. */
export function canPlaceModifier(at: SlotAddress, wordId: WordId): boolean {
  const kind = getWord(wordId).kind
  if (kind !== 'adjective' && kind !== 'adverb') return false
  return MODIFIER_TARGET_ROLES[kind].includes(at.role)
}

const ROLES: readonly SlotRole[] = ['subject', 'object', 'verb']

/** 드롭 대상 id: `{clause}:{role}:head` 또는 `{clause}:{role}:m{index}` */
export function dropId(address: SlotAddress, modifierIndex: number | null): string {
  return `${address.clause}:${address.role}:${modifierIndex === null ? 'head' : `m${modifierIndex}`}`
}

/** dropId의 역함수. 형식이 맞지 않으면 null. */
export function parseDropId(id: string): { at: SlotAddress; modifierIndex?: number } | null {
  const [clause, role, part] = id.split(':')
  const roleValue = ROLES.find((r) => r === role)
  const clauseIndex = Number(clause)
  if (!roleValue || part === undefined || !Number.isInteger(clauseIndex)) return null
  const at = { clause: clauseIndex, role: roleValue }
  if (part === 'head') return { at }
  const modifierIndex = Number(part.slice(1))
  return part.startsWith('m') && Number.isInteger(modifierIndex) ? { at, modifierIndex } : null
}

/** 현재 문장의 어느 슬롯(head 또는 수식어 칸)에든 놓을 수 있는가. 문형 불일치로 쓸 수 없는 단어를 표시하는 데 쓴다. */
export function canPlayAnywhere(board: Board, wordId: WordId): boolean {
  if (getWord(wordId).kind === 'junk') return false
  return board.clauses.some((clause, clauseIndex) =>
    clause.slots.some((slot) => {
      const at = { clause: clauseIndex, role: slot.role }
      return canPlaceHead(board, at, wordId) || canPlaceModifier(at, wordId)
    }),
  )
}

/** 연결어 칸의 드롭 대상 id. 슬롯 주소 형식이 아니므로 parseDropId는 null을 돌려준다. */
export const CONNECTIVE_DROP_ID = 'connective'

export function isConnectiveWord(wordId: WordId): boolean {
  return getWord(wordId).kind === 'connective'
}
