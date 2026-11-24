import type { BuildState } from '@/game/build/build'
import { type CardFacts, cardFacts } from './describe'
import { Icon } from './Icon'
import { ICONS, TONES } from './icons'
import { Tooltip } from './Tooltip'
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
  /** 강화 단계(카드 설명의 강화 전후 값). */
  build: BuildState
  /** 손패 밖 기본 동사 타일. available이 false면 이미 문장에 놓였다. */
  basic: { readonly wordId: WordId; readonly available: boolean }
}

/** 겹침: 손패가 이 장수를 넘으면 카드끼리 겹친다. 카드 하나가 더해질 때마다 겹침이 늘고, 최대치에서 멈춘다(px). */
const OVERLAP = { freeCards: 4, stepPx: 14, basePx: 18, maxPx: 84 } as const

/** 카드 수에 따른 이웃 카드와의 겹침 폭(px). */
function overlapFor(count: number): number {
  if (count <= OVERLAP.freeCards) return 0
  return Math.min(OVERLAP.maxPx, OVERLAP.basePx + (count - OVERLAP.freeCards) * OVERLAP.stepPx)
}

/** 카드 설명 툴팁 내용: 사실(강화 전후 포함)과 배지. */
function CardTip({ facts }: { facts: CardFacts }) {
  return (
    <span className="flex flex-col gap-1">
      {facts.facts.map((f, i) => (
        <span key={i} className={`flex items-center gap-1 ${TONES[f.kind] ?? ''}`}>
          <Icon name={ICONS[f.kind]} className="text-[13px]" />
          {f.text}
        </span>
      ))}
      {facts.badges.length > 0 && <span className="text-on-surface-variant">{facts.badges.join(' · ')}</span>}
    </span>
  )
}

export function Hand({ hand, board, build, selectedId, marked, disabled, onSelect, basic }: HandProps) {
  const basicDef = getWord(basic.wordId)
  const overlap = overlapFor(hand.length)
  return (
    <div className="flex min-w-0 flex-1 items-end justify-center gap-2" data-testid="hand">
      <div className="flex flex-col items-center gap-1 border-r border-outline-variant pr-2">
        <Tooltip longPress content={<CardTip facts={cardFacts(basic.wordId, build)} />}>
          <WordTile
            def={basicDef}
            facts={cardFacts(basic.wordId, build)}
            instanceId={BASIC_VERB_INSTANCE}
            testId="tile-basic"
            selected={selectedId === BASIC_VERB_INSTANCE}
            marked={false}
            disabled={disabled || !basic.available || marked !== null}
            draggable={marked === null}
            playable={basic.available && canPlayAnywhere(board, basic.wordId)}
            onSelect={() => onSelect(BASIC_VERB_INSTANCE)}
          />
        </Tooltip>
        <span className="font-ui text-[10px] text-outline">기본 동사</span>
      </div>
      <div className="flex items-end">
        {hand.map((card, index) => {
          const def = getWord(card.wordId)
          const facts = cardFacts(card.wordId, build)
          const front = card.instanceId === selectedId || (marked?.has(card.instanceId) ?? false)
          return (
            // 겹친 카드는 마우스를 올리거나 고르면 맨 앞으로 나온다(z-index). DOM 순서는 그대로 둔다.
            <div
              key={card.instanceId}
              className={`relative transition-[margin] hover:z-40 ${front ? 'z-30' : 'z-0'}`}
              style={{ marginLeft: index === 0 ? 0 : -overlap }}
            >
              <Tooltip longPress content={<CardTip facts={facts} />}>
                <WordTile
                  def={def}
                  facts={facts}
                  instanceId={card.instanceId}
                  selected={card.instanceId === selectedId}
                  marked={marked?.has(card.instanceId) ?? false}
                  disabled={disabled}
                  draggable={marked === null}
                  playable={!def.enemyOnly && canPlayAnywhere(board, card.wordId)}
                  onSelect={() => onSelect(card.instanceId)}
                />
              </Tooltip>
            </div>
          )
        })}
      </div>
      {hand.length === 0 && <p className="self-center text-sm text-outline">손패가 비었습니다.</p>}
    </div>
  )
}
