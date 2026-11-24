import { useLayoutEffect, useRef, useState } from 'react'
import { overlapFor } from './handLayout'
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

/** 기본 동사 열과 손패 줄 사이 간격(gap-2, px). */
const HAND_ROW_GAP = 8
/** 겹치지 않을 때 카드 사이 간격(px). 겹침을 잴 때 이 간격만큼 폭을 덜 쓴 것으로 본다. */
const CARD_GAP = 6

export function Hand({ hand, board, build, selectedId, marked, disabled, onSelect, basic }: HandProps) {
  const basicDef = getWord(basic.wordId)
  // 손패 줄의 실제 폭을 재서, 장수가 많으면 그 폭에 다 들어가게 겹친다.
  const rowRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY)
  useLayoutEffect(() => {
    const row = rowRef.current?.parentElement
    if (!row) return
    const measure = () => {
      const basicColumn = row.firstElementChild
      const used = basicColumn instanceof HTMLElement ? basicColumn.offsetWidth : 0
      setAvailable(row.clientWidth - used - HAND_ROW_GAP)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    return () => observer.disconnect()
  }, [])
  const overlap = overlapFor(hand.length, available - CARD_GAP * Math.max(0, hand.length - 1))
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
        <span className="flex items-center gap-0.5 font-ui text-xs text-outline">
          <Icon name="all_inclusive" className="text-[14px]" />
          기본 동사
        </span>
      </div>
      <div ref={rowRef} className="flex items-end">
        {hand.map((card, index) => {
          const def = getWord(card.wordId)
          const facts = cardFacts(card.wordId, build)
          const front = card.instanceId === selectedId || (marked?.has(card.instanceId) ?? false)
          return (
            // 겹친 카드는 마우스를 올리거나 고르면 맨 앞으로 나온다(z-index). DOM 순서는 그대로 둔다.
            <div
              key={card.instanceId}
              className={`relative transition-[margin] hover:z-40 ${front ? 'z-30' : 'z-0'}`}
              style={{ marginLeft: index === 0 ? 0 : overlap > 0 ? -overlap : CARD_GAP }}
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
