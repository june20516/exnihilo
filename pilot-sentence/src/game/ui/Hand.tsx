import { getWord } from '@/game/content/words'
import type { CardInst } from '@/game/rally/combat'
import type { Board } from '@/game/sentence/board'
import { canPlayAnywhere } from './placement'
import { WordTile } from './WordTile'

interface HandProps {
  hand: readonly CardInst[]
  board: Board
  selectedId: string | null
  /** 버리기 모드에서 표시한 카드. 버리기 모드가 아니면 null. */
  marked: ReadonlySet<string> | null
  disabled: boolean
  onSelect: (instanceId: string) => void
}

export function Hand({ hand, board, selectedId, marked, disabled, onSelect }: HandProps) {
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
            marked={marked?.has(card.instanceId) ?? false}
            disabled={disabled}
            draggable={marked === null}
            playable={!def.enemyOnly && canPlayAnywhere(board, card.wordId)}
            onSelect={() => onSelect(card.instanceId)}
          />
        )
      })}
      {hand.length === 0 && <p className="self-center text-sm text-outline">손패가 비었습니다.</p>}
    </div>
  )
}
