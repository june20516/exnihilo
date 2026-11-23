import type { SlotAddress } from '@/game/content/encounters'
import { getWord } from '@/game/content/words'
import type { PlacedWord, SlotState } from '@/game/sentence/board'
import { Icon } from './Icon'
import { ROLE_NAMES } from './describe'
import { KIND_STYLES } from './wordStyle'

interface SlotViewProps {
  slot: SlotState
  address: SlotAddress
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

export function SlotView(props: SlotViewProps) {
  const { slot, address, nameOf, particle, headPlaceable, modifierPlaceable, onHeadClick, onModifierClick } = props
  const headDef = getWord(slot.head.wordId)
  const slotId = `${address.clause}-${address.role}`
  const highlight = 'ring-2 ring-secondary shadow-[0_0_16px_rgba(252,186,91,0.5)] cursor-pointer'

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-label text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
        {ROLE_NAMES[address.role]}
      </span>
      <div className="flex items-end gap-1.5">
        {slot.modifiers.map((modifier, index) => {
          const modifierDef = modifier ? getWord(modifier.wordId) : null
          return (
            <button
              key={index}
              type="button"
              data-testid={`mod-${slotId}-${index}`}
              data-modifier={`${slotId}:${index}`}
              onClick={() => onModifierClick(index)}
              className={`flex h-20 min-w-16 flex-col items-center justify-center rounded-lg px-2 transition-all ${
                modifier ? 'bg-surface-container-high shadow-md' : 'border border-dashed border-outline-variant/60'
              } ${modifierPlaceable ? highlight : ''}`}
            >
              {modifier && modifierDef ? (
                <>
                  <span className={`font-headline text-base font-bold ${KIND_STYLES[modifierDef.kind].text}`}>
                    {nameOf(modifier)}
                  </span>
                  <InkDots word={modifier} />
                </>
              ) : (
                <span className="text-xs text-outline-variant">＋</span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          data-testid={`slot-${slotId}`}
          data-slot={slotId}
          onClick={onHeadClick}
          className={`relative flex h-20 min-w-32 flex-col items-center justify-center rounded-lg px-3 shadow-xl transition-all ${
            address.role === 'verb' ? 'bg-primary-container' : 'bg-surface-container-highest'
          } ${headPlaceable ? highlight : ''}`}
        >
          {slot.sealed && <Icon name="lock" className="absolute right-1.5 top-1.5 text-[14px] text-secondary" />}
          <span
            className={`font-headline text-2xl font-black tracking-tight ${
              address.role === 'verb' ? 'text-on-primary-container' : KIND_STYLES[headDef.kind].text
            }`}
          >
            {nameOf(slot.head)}
          </span>
          <span className="flex items-center gap-1 font-label text-[10px] text-on-surface-variant">
            {slot.head.owner === 'enemy' ? '원문' : '내 단어'}
            <InkDots word={slot.head} />
          </span>
        </button>
        {particle && (
          <span
            data-testid={`particle-${slotId}`}
            className="mb-6 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high font-headline text-lg font-bold text-secondary shadow-md"
          >
            {particle}
          </span>
        )}
      </div>
    </div>
  )
}
