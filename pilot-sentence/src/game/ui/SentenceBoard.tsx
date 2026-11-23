import type { SlotAddress } from '@/game/content/enemies'
import { FRAMES } from '@/game/grammar/frames'
import { attachParticle } from '@/game/grammar/josa'
import { type Board, isSlotActive, type PlacedWord } from '@/game/sentence/board'
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
    <section
      className="flex min-h-0 flex-1 flex-col justify-center gap-3 rounded-xl bg-surface-container-low p-4 shadow-xl"
      data-testid="sentence"
    >
      {board.clauses.map((clause, clauseIndex) => (
        <div key={clauseIndex} className="flex flex-wrap items-end justify-center gap-4" data-clause={clauseIndex}>
          {FRAMES[clause.frameId].slots.map((slotDef) => {
            const slot = clause.slots.find((s) => s.role === slotDef.role)
            if (!slot) return null
            const at = { clause: clauseIndex, role: slot.role }
            const active = isSlotActive(board, at)
            const name = nameOf(slot.head)
            const particle = slotDef.particle ? attachParticle(name, slotDef.particle).slice(name.length) : null
            return (
              <SlotView
                key={slot.role}
                slot={slot}
                address={at}
                active={active}
                nameOf={nameOf}
                particle={particle}
                headPlaceable={selectedWordId !== null && canPlaceHead(board, at, selectedWordId)}
                modifierPlaceable={selectedWordId !== null && active && canPlaceModifier(at, selectedWordId)}
                onHeadClick={() => onHeadClick(at)}
                onModifierClick={(index) => onModifierClick(at, index)}
              />
            )
          })}
        </div>
      ))}
    </section>
  )
}
