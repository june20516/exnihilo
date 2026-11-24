import { getWord, type WordId } from '@/game/content/words'
import { BASIC_VERB_INSTANCE, type CardInst } from '@/game/rally/combat'
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
  /** 손패 밖 기본 동사 타일. available이 false면 이미 문장에 놓였다. */
  basic: { readonly wordId: WordId; readonly available: boolean }
}

export function Hand({ hand, board, selectedId, marked, disabled, onSelect, basic }: HandProps) {
  const basicDef = getWord(basic.wordId)
  return (
    <div className="flex min-w-0 flex-1 items-end justify-center gap-2" data-testid="hand">
      <div className="flex flex-col items-center gap-1 border-r border-outline-variant pr-2">
        <WordTile
          def={basicDef}
          instanceId={BASIC_VERB_INSTANCE}
          testId="tile-basic"
          selected={selectedId === BASIC_VERB_INSTANCE}
          marked={false}
          disabled={disabled || !basic.available || marked !== null}
          draggable={marked === null}
          playable={basic.available && canPlayAnywhere(board, basic.wordId)}
          onSelect={() => onSelect(BASIC_VERB_INSTANCE)}
        />
        <span className="font-label text-[10px] text-outline">기본 동사</span>
      </div>
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
