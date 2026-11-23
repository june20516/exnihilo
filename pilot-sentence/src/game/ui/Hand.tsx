import type { CardInst } from '@/game/combat/combat'
import { getWord } from '@/game/content/words'
import type { Board } from '@/game/sentence/board'
import { canPlayAnywhere } from './placement'
import { WordTile } from './WordTile'

interface HandProps {
  hand: readonly CardInst[]
  board: Board
  resource: number
  selectedId: string | null
  disabled: boolean
  onSelect: (instanceId: string) => void
}

export function Hand({ hand, board, resource, selectedId, disabled, onSelect }: HandProps) {
  return (
    <div className="flex min-w-0 flex-1 items-end justify-center gap-2" data-testid="hand">
      {hand.map((card) => {
        const def = getWord(card.wordId)
        return (
          <WordTile
            key={card.instanceId}
            def={def}
            instanceId={card.instanceId}
            selected={card.instanceId === selectedId}
            disabled={disabled}
            playable={canPlayAnywhere(board, card.wordId) && (def.cost ?? Number.POSITIVE_INFINITY) <= resource}
            onSelect={() => onSelect(card.instanceId)}
          />
        )
      })}
      {hand.length === 0 && <p className="self-center text-sm text-outline">손패가 비었습니다.</p>}
    </div>
  )
}
