import type { SlotAddress } from '@/game/content/encounters'
import type { Board, PlacedWord } from '@/game/sentence/board'
import { attachParticle } from './josa'
import { FRAMES } from './frames'

export type RenderToken =
  | {
      readonly kind: 'modifier' | 'head'
      readonly text: string
      readonly address: SlotAddress
      readonly word: PlacedWord
      readonly modifierIndex?: number
    }
  | { readonly kind: 'particle'; readonly text: string }

/** 절을 화면 표시 순서(수식어 → head → 조사)의 토큰으로 바꾼다. 조사는 표시 이름 기준이다. */
export function renderClause(board: Board, clauseIndex: number, nameOf: (word: PlacedWord) => string): RenderToken[] {
  const clause = board.clauses[clauseIndex]
  if (!clause) return []
  const tokens: RenderToken[] = []
  for (const slotDef of FRAMES[clause.frameId].slots) {
    const slot = clause.slots.find((s) => s.role === slotDef.role)
    if (!slot) continue
    const address = { clause: clauseIndex, role: slot.role }
    slot.modifiers.forEach((modifier, index) => {
      if (modifier) tokens.push({ kind: 'modifier', text: nameOf(modifier), address, word: modifier, modifierIndex: index })
    })
    const name = nameOf(slot.head)
    tokens.push({ kind: 'head', text: name, address, word: slot.head })
    if (slotDef.particle) {
      tokens.push({ kind: 'particle', text: attachParticle(name, slotDef.particle).slice(name.length) })
    }
  }
  return tokens
}
