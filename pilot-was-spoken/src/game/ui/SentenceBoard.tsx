import type { SlotAddress } from '@/game/content/enemies'
import { FRAMES } from '@/game/grammar/frames'
import { attachParticle } from '@/game/grammar/josa'
import { getWord } from '@/game/content/words'
import { type Board, isSlotActive, type PlacedWord } from '@/game/sentence/board'
import { CONNECTIVE_DROP_ID, canPlaceHead, canPlaceModifier } from './placement'
import { Icon } from './Icon'
import { ROLE_ICONS, SLOT_SIZES } from './slotStyle'
import { Droppable, HIGHLIGHT, RoleLabel, SlotView } from './SlotView'

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
  const compact = board.clauses.length > 1
  return (
    <section className="flex min-h-0 flex-col justify-center gap-2 short:gap-1" data-testid="sentence">
      {board.clauses.map((clause, clauseIndex) => (
        <div key={clauseIndex} className="flex flex-wrap items-end justify-center gap-2.5" data-clause={clauseIndex}>
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
                compact={compact}
              />
            )
          })}
          {clauseIndex === 0 && (
            <ConnectiveSlot connective={connective} placeable={connectivePlaceable} onClick={onConnectiveClick} compact={compact} />
          )}
        </div>
      ))}
    </section>
  )
}

/** 첫 절 끝의 연결어 칸. 연결어를 놓으면 둘째 절이 열리고, 차 있는 칸을 누르면 연결어가 손패로 돌아온다. */
function ConnectiveSlot(props: { connective: PlacedWord | null; placeable: boolean; onClick: () => void; compact: boolean }) {
  const { connective, placeable, onClick, compact } = props
  const size = SLOT_SIZES[compact ? 'compact' : 'normal']
  return (
    <div className="ml-2 flex flex-col items-center gap-1">
      <RoleLabel icon={ROLE_ICONS.connective}>연결어</RoleLabel>
      <Droppable id={CONNECTIVE_DROP_ID}>
        {(isOver, ref) => (
          <button
            ref={ref}
            type="button"
            data-testid="connective-slot"
            onClick={onClick}
            title={connective ? '누르면 손패로 돌아옵니다' : '연결어를 놓으면 둘째 절이 열립니다'}
            className={`flex ${size.box} ${compact ? 'min-w-16' : 'min-w-20'} items-center justify-center rounded-xl px-2 transition-all ${
              connective ? 'bg-primary/20 shadow-md' : 'border border-dashed border-outline-variant/60'
            } ${placeable ? HIGHLIGHT : ''} ${isOver && placeable ? 'scale-105' : ''}`}
          >
            {connective ? (
              <span className={`font-card font-black text-primary ${compact ? 'text-lg' : 'text-2xl'}`}>{getWord(connective.wordId).text}</span>
            ) : (
              <Icon name="add_link" className="text-[26px] text-outline-variant" />
            )}
          </button>
        )}
      </Droppable>
    </div>
  )
}
