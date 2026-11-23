import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { SlotAddress } from '@/game/content/enemies'
import { getWord } from '@/game/content/words'
import type { PlacedWord, SlotState } from '@/game/sentence/board'
import { ROLE_NAMES } from './describe'
import { Icon } from './Icon'
import { dropId } from './placement'
import { KIND_STYLES } from './wordStyle'

interface SlotViewProps {
  slot: SlotState
  address: SlotAddress
  /** 동사가 자동사면 목적어 슬롯은 비활성(회색, 실행 무시). */
  active: boolean
  nameOf: (word: PlacedWord) => string
  particle: string | null
  headPlaceable: boolean
  modifierPlaceable: boolean
  onHeadClick: () => void
  onModifierClick: (index: number) => void
}

function InkDots({ word }: { word: PlacedWord }) {
  if (word.owner !== 'player' || word.inkLeft === null) return null
  return (
    <span className="flex gap-0.5" title={`잉크 ${word.inkLeft}`}>
      {Array.from({ length: word.inkLeft }, (_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-secondary" />
      ))}
    </span>
  )
}

function Droppable({
  id,
  children,
}: {
  id: string
  children: (isOver: boolean, ref: (el: HTMLElement | null) => void) => ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return <>{children(isOver, setNodeRef)}</>
}

const HEAD_LABELS = { player: '내 단어', enemy: '원문', implied: '생략', emptyVerb: '비어 있음' } as const

const HIGHLIGHT = 'ring-2 ring-secondary shadow-[0_0_16px_rgba(252,186,91,0.5)] cursor-pointer'

export function SlotView(props: SlotViewProps) {
  const { slot, address, active, nameOf, particle, headPlaceable, modifierPlaceable, onHeadClick, onModifierClick } =
    props
  const headDef = getWord(slot.head.wordId)
  const slotId = `${address.clause}-${address.role}`
  const isVerb = address.role === 'verb'

  return (
    <div className={`flex flex-col items-center gap-1 ${active ? '' : 'opacity-30'}`} data-active={active}>
      <span className="font-label text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
        {ROLE_NAMES[address.role]}
        {!active && ' (자동사라 없음)'}
      </span>
      <div className="flex items-end gap-1.5">
        {slot.modifiers.map((modifier, index) => {
          const modifierDef = modifier ? getWord(modifier.wordId) : null
          return (
            <Droppable key={index} id={dropId(address, index)}>
              {(isOver, ref) => (
                <button
                  ref={ref}
                  type="button"
                  disabled={!active}
                  data-testid={`mod-${slotId}-${index}`}
                  data-modifier={`${slotId}:${index}`}
                  onClick={() => onModifierClick(index)}
                  className={`flex h-16 min-w-14 flex-col items-center justify-center rounded-lg px-2 transition-all ${
                    modifier ? 'bg-surface-container-high shadow-md' : 'border border-dashed border-outline-variant/60'
                  } ${modifierPlaceable && active ? HIGHLIGHT : ''} ${isOver && modifierPlaceable ? 'scale-110' : ''}`}
                >
                  {modifier && modifierDef ? (
                    <>
                      <span className={`font-headline text-sm font-bold ${KIND_STYLES[modifierDef.kind].text}`}>
                        {nameOf(modifier)}
                      </span>
                      <InkDots word={modifier} />
                    </>
                  ) : (
                    <span className="text-xs text-outline-variant">＋</span>
                  )}
                </button>
              )}
            </Droppable>
          )
        })}
        <Droppable id={dropId(address, null)}>
          {(isOver, ref) => (
            <button
              ref={ref}
              type="button"
              disabled={!active}
              data-testid={`slot-${slotId}`}
              data-slot={slotId}
              onClick={onHeadClick}
              className={`relative flex h-16 min-w-28 flex-col items-center justify-center rounded-lg px-3 shadow-xl transition-all ${
                active
                  ? isVerb
                    ? 'bg-primary-container'
                    : 'bg-surface-container-highest'
                  : 'border border-dashed border-outline-variant bg-transparent'
              } ${headPlaceable ? HIGHLIGHT : ''} ${isOver && headPlaceable ? 'scale-105' : ''}`}
            >
              {slot.sealed && <Icon name="lock" className="absolute right-1 top-1 text-[13px] text-secondary" />}
              <span
                className={`font-headline text-xl font-black tracking-tight ${
                  isVerb ? 'text-on-primary-container' : KIND_STYLES[headDef.kind].text
                } ${slot.head.owner === 'blank' ? 'opacity-40' : ''}`}
              >
                {nameOf(slot.head)}
              </span>
              <span className="flex items-center gap-1 font-label text-[10px] text-on-surface-variant">
                {HEAD_LABELS[slot.head.owner === 'blank' ? (isVerb ? 'emptyVerb' : 'implied') : slot.head.owner]}
                <InkDots word={slot.head} />
              </span>
            </button>
          )}
        </Droppable>
        {particle && active && (
          <span
            data-testid={`particle-${slotId}`}
            className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high font-headline text-lg font-bold text-secondary shadow-md"
          >
            {particle}
          </span>
        )}
      </div>
    </div>
  )
}
