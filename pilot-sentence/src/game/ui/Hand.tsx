import type { CardInst } from '@/game/combat/combat'
import { getWord } from '@/game/content/words'
import { WordTile } from './WordTile'

interface HandProps {
  hand: readonly CardInst[]
  selectedId: string | null
  disabled: boolean
  onSelect: (instanceId: string) => void
}

export function Hand({ hand, selectedId, disabled, onSelect }: HandProps) {
  return (
    <div className="flex min-h-56 items-end gap-3" data-testid="hand">
      {hand.map((card) => (
        <WordTile
          key={card.instanceId}
          def={getWord(card.wordId)}
          instanceId={card.instanceId}
          selected={card.instanceId === selectedId}
          disabled={disabled}
          onSelect={() => onSelect(card.instanceId)}
        />
      ))}
      {hand.length === 0 && <p className="text-sm text-outline">손패가 비었습니다.</p>}
    </div>
  )
}
