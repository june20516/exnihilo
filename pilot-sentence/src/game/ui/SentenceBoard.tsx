import type { SlotAddress } from '@/game/content/enemies'
import { FRAMES } from '@/game/grammar/frames'
import { attachParticle } from '@/game/grammar/josa'
import { getWord } from '@/game/content/words'
import { type Board, isSlotActive, type PlacedWord } from '@/game/sentence/board'
import { CONNECTIVE_DROP_ID, canPlaceHead, canPlaceModifier } from './placement'
import { Droppable, HIGHLIGHT, SlotView } from './SlotView'

interface SentenceBoardProps {
  board: Board
  nameOf: (word: PlacedWord) => string
  selectedWordId: string | null
  onHeadClick: (at: SlotAddress) => void
  onModifierClick: (at: SlotAddress, index: number) => void
  /** 연결어 칸의 카드. 있으면 둘째 절이 열려 있다. */
  connective: PlacedWord | null
  /** 선택한 카드를 연결어 칸에 놓을 수 있는가(강조 표시). */
  connectivePlaceable: boolean
  onConnectiveClick: () => void
  /** 이 절의 목적어를 주어와 같아 생략하는가. */
  omitsObject: (clause: number) => boolean
}

export function SentenceBoard(props: SentenceBoardProps) {
  const { board, nameOf, selectedWordId, onHeadClick, onModifierClick, connective, connectivePlaceable, onConnectiveClick, omitsObject } = props
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
                omitted={slot.role === 'object' && omitsObject(clauseIndex)}
              />
            )
          })}
          {clauseIndex === 0 && (
            <ConnectiveSlot connective={connective} placeable={connectivePlaceable} onClick={onConnectiveClick} />
          )}
        </div>
      ))}
    </section>
  )
}

/** 첫 절 끝의 연결어 칸. 연결어를 놓으면 둘째 절이 열리고, 차 있는 칸을 누르면 연결어가 손패로 돌아온다. */
function ConnectiveSlot({ connective, placeable, onClick }: { connective: PlacedWord | null; placeable: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-ui text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">연결어</span>
      <Droppable id={CONNECTIVE_DROP_ID}>
        {(isOver, ref) => (
          <button
            ref={ref}
            type="button"
            data-testid="connective-slot"
            onClick={onClick}
            title={connective ? '누르면 손패로 돌아옵니다' : '연결어를 놓으면 둘째 절이 열립니다'}
            className={`flex h-16 min-w-20 items-center justify-center rounded-lg px-3 transition-all ${
              connective ? 'bg-primary/20 shadow-md' : 'border border-dashed border-outline-variant/60'
            } ${placeable ? HIGHLIGHT : ''} ${isOver && placeable ? 'scale-105' : ''}`}
          >
            {connective ? (
              <span className="font-card text-lg font-black text-primary">{getWord(connective.wordId).text}</span>
            ) : (
              <span className="text-xs text-outline-variant">＋</span>
            )}
          </button>
        )}
      </Droppable>
    </div>
  )
}
