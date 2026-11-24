import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { SlotAddress } from '@/game/content/enemies'
import { getWord } from '@/game/content/words'
import type { PlacedWord, SlotState } from '@/game/sentence/board'
import { ROLE_NAMES } from './describe'
import { Icon } from './Icon'
import { dropId } from './placement'
import { HEAD_ICONS, ROLE_ICONS, SLOT_SIZES } from './slotStyle'
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
  /** 지원 동사의 빈 목적어가 주어와 같아 문구에서 생략되는가(rally/text omitsObject). */
  omitted?: boolean
  /** 절이 둘이라 높이가 모자라면 칸을 작게 그린다. */
  compact?: boolean
}

/** 놓은 내 단어를 판 밖으로 끌면 뺀다. 드래그 id는 `placed:{dropId}`. */
export const PLACED_DRAG_PREFIX = 'placed:'

/** 놓은 내 단어만 끌 수 있게 감싼다. 클릭은 그대로 부모 버튼에 간다(6px 이상 움직여야 드래그). */
function PlacedDraggable({ id, enabled, children }: { id: string; enabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${PLACED_DRAG_PREFIX}${id}`, disabled: !enabled })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 60 } : undefined
  return (
    <span ref={setNodeRef} style={style} {...attributes} {...listeners} role={undefined} tabIndex={undefined} className={`flex touch-none flex-col items-center ${isDragging ? 'opacity-70' : ''}`}>
      {children}
    </span>
  )
}

export function Droppable({
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
/** 칸 이름(아이콘 + 이름). */
export function RoleLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-0.5 font-ui text-xs font-bold tracking-widest text-outline">
      <Icon name={icon} className="text-[15px]" />
      {children}
    </span>
  )
}

export const HIGHLIGHT = 'ring-2 ring-secondary shadow-[0_0_16px_rgba(252,186,91,0.5)] cursor-pointer'

export function SlotView(props: SlotViewProps) {
  const { slot, address, active, nameOf, particle, headPlaceable, modifierPlaceable, onHeadClick, onModifierClick, omitted = false, compact = false } =
    props
  const size = SLOT_SIZES[compact ? 'compact' : 'normal']
  const headKind = slot.head.owner === 'blank' ? (address.role === 'verb' ? 'emptyVerb' : 'implied') : slot.head.owner
  const headDef = getWord(slot.head.wordId)
  const slotId = `${address.clause}-${address.role}`
  const isVerb = address.role === 'verb'

  return (
    <div className={`flex flex-col items-center gap-1 ${active ? '' : 'opacity-30'}`} data-active={active}>
      <RoleLabel icon={ROLE_ICONS[address.role]}>
        {ROLE_NAMES[address.role]}
        {!active && ' (자동사라 없음)'}
      </RoleLabel>
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
                  className={`flex ${size.box} ${size.modifier} flex-col items-center justify-center rounded-xl px-2 transition-all ${
                    modifier ? 'bg-surface-container-high shadow-md' : 'border border-dashed border-outline-variant/60'
                  } ${modifierPlaceable && active ? HIGHLIGHT : ''} ${isOver && modifierPlaceable ? 'scale-110' : ''}`}
                >
                  {modifier && modifierDef ? (
                    <PlacedDraggable id={dropId(address, index)} enabled={modifier.owner === 'player'}>
                      <span className={`font-card font-bold ${KIND_STYLES[modifierDef.kind].text}`}>
                        {nameOf(modifier)}
                      </span>
                    </PlacedDraggable>
                  ) : (
                    <Icon name="add" className="text-[18px] text-outline-variant" />
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
              className={`relative flex ${size.box} ${size.head} flex-col items-center justify-center rounded-xl shadow-xl transition-all ${
                active
                  ? isVerb
                    ? 'bg-primary-container'
                    : 'bg-surface-container-highest'
                  : 'border border-dashed border-outline-variant bg-transparent'
              } ${headPlaceable ? HIGHLIGHT : ''} ${isOver && headPlaceable ? 'scale-105' : ''}`}
            >
              {slot.sealed && <Icon name="lock" className="absolute right-1 top-1 text-[13px] text-secondary" />}
              <PlacedDraggable id={dropId(address, null)} enabled={slot.head.owner === 'player'}>
                <span
                  className={`font-card font-black leading-tight tracking-tight ${
                    isVerb ? 'text-on-primary-container' : KIND_STYLES[headDef.kind].text
                  } ${slot.head.owner === 'blank' ? 'opacity-40' : ''}`}
                >
                  {omitted ? '—' : nameOf(slot.head)}
                </span>
                <span className="flex items-center gap-0.5 font-ui text-xs text-on-surface-variant">
                  <Icon name={omitted ? 'visibility_off' : HEAD_ICONS[headKind]} className="text-[13px]" />
                  {omitted ? '주어와 같아 생략' : HEAD_LABELS[headKind]}
                </span>
              </PlacedDraggable>
            </button>
          )}
        </Droppable>
        {particle && active && !omitted && (
          <span
            data-testid={`particle-${slotId}`}
            className={`${size.particle} flex items-center justify-center rounded-full bg-surface-container-high font-card font-bold text-secondary shadow-md`}
          >
            {particle}
          </span>
        )}
      </div>
    </div>
  )
}
