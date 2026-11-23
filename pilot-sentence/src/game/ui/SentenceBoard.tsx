import type { SlotAddress } from '@/game/content/encounters'
import { FRAMES } from '@/game/grammar/frames'
import { renderClause } from '@/game/grammar/render'
import type { Board, PlacedWord } from '@/game/sentence/board'
import { canPlaceHead, canPlaceModifier } from './placement'
import { SlotView } from './SlotView'

interface SentenceBoardProps {
  board: Board
  nameOf: (word: PlacedWord) => string
  selectedWordId: string | null
  onHeadClick: (at: SlotAddress) => void
  onModifierClick: (at: SlotAddress, index: number) => void
}

export function SentenceBoard({ board, nameOf, selectedWordId, onHeadClick, onModifierClick }: SentenceBoardProps) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-container-low p-6 shadow-xl" data-testid="sentence">
      <div>
        <h2 className="font-headline text-lg font-bold">통사 제단</h2>
        <p className="text-sm text-on-surface-variant">어휘를 슬롯에 새겨 현실의 법칙을 왜곡하십시오.</p>
      </div>
      {board.clauses.map((clause, clauseIndex) => {
        const tokens = renderClause(board, clauseIndex, nameOf)
        return (
          <div key={clauseIndex} className="flex flex-wrap items-end justify-center gap-4" data-clause={clauseIndex}>
            {FRAMES[clause.frameId].slots.map((slotDef) => {
              const slot = clause.slots.find((s) => s.role === slotDef.role)
              if (!slot) return null
              const at = { clause: clauseIndex, role: slot.role }
              const headIndex = tokens.findIndex(
                (t) => t.kind === 'head' && t.address.clause === clauseIndex && t.address.role === slot.role,
              )
              const next = tokens[headIndex + 1]
              const particle = next && next.kind === 'particle' ? next.text : null
              return (
                <SlotView
                  key={slot.role}
                  slot={slot}
                  address={at}
                  nameOf={nameOf}
                  particle={particle}
                  headPlaceable={selectedWordId !== null && canPlaceHead(board, at, selectedWordId)}
                  modifierPlaceable={selectedWordId !== null && canPlaceModifier(at, selectedWordId)}
                  onHeadClick={() => onHeadClick(at)}
                  onModifierClick={(index) => onModifierClick(at, index)}
                />
              )
            })}
          </div>
        )
      })}
    </section>
  )
}
