import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { RALLY_ENCOUNTERS, type SlotAddress } from '@/game/content/enemies'
import type { CombatEvent } from '@/game/combat/events'
import { BASIC_VERB_INSTANCE, basicVerbAvailable, type RallyAction, type RallyState } from '@/game/rally/combat'
import { sentenceCalc } from '@/game/rally/formula'
import { previewEvents } from '@/game/rally/preview'
import { hasVerb, isBlank } from '@/game/rally/sentence'
import { amplifiers, finalHp, intentActions, pileContents, previewSummary } from '@/game/rally/summary'
import { eventNotice, intentTexts, lingeringStates, omitsObject, wordNamer } from '@/game/rally/text'
import { getWord } from '@/game/content/words'
import { getSlot } from '@/game/sentence/board'
import { cardSummary } from './describe'
import { PLACED_DRAG_PREFIX } from './SlotView'
import { Battlefield } from './Battlefield'
import { CombatResult } from './CombatResult'
import { ActionColumn } from './ActionColumn'
import { CombatChips } from './CombatChips'
import { Drawer } from './Drawer'
import { IntoHeader } from './HeaderSlot'
import { Icon } from './Icon'
import { ResourcePanel } from './ResourcePanel'
import { Hand } from './Hand'
import { CONNECTIVE_DROP_ID, isConnectiveWord, parseDropId } from './placement'
import { SentenceBoard } from './SentenceBoard'
import { FormulaChips } from './FormulaChips'
import { SidePanel } from './SidePanel'

interface CombatScreenProps {
  state: RallyState
  /** 연출 재생 중이면 입력을 막는다. */
  busy: boolean
  lastEvents: readonly CombatEvent[]
  dispatch: (action: RallyAction) => void
  /** 있으면 전투가 끝났을 때 결과 오버레이를 띄운다(샌드박스). 런에서는 런 화면이 다음 화면을 정한다. */
  onRestart?: () => void
}

export function CombatScreen({ state, busy, lastEvents, dispatch, onRestart }: CombatScreenProps) {
  const encounterId = state.encounterId
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 버리기 모드에서 표시한 카드. null이면 버리기 모드가 아니다. */
  const [marked, setMarked] = useState<ReadonlySet<string> | null>(null)
  /** 카드를 끄는 중이면 서랍이 마우스에 반응하지 않는다. */
  const [dragging, setDragging] = useState(false)

  const portraits = useMemo(() => {
    const map: Record<string, string> = { player: '/assets/explorer.jpg' }
    for (const enemy of RALLY_ENCOUNTERS[encounterId]?.enemies ?? []) map[enemy.defId] = enemy.portrait
    return map
  }, [encounterId])

  const canAct = state.phase === 'player' && !busy
  const nameOf = useMemo(() => wordNamer(state), [state])

  const selectedCard =
    selectedId === BASIC_VERB_INSTANCE
      ? { instanceId: BASIC_VERB_INSTANCE, wordId: state.build.basicVerb }
      : (state.deck.hand.find((c) => c.instanceId === selectedId) ?? null)
  const notice = eventNotice(lastEvents)
  const preview = useMemo(() => (state.phase === 'player' ? previewEvents(state) : null), [state])
  const calcs = useMemo(() => (state.phase === 'player' ? sentenceCalc(state) : []), [state])
  // 미리보기는 한 번만 계산하고(previewEvents), 요약·예고가 같은 결과를 나눠 쓴다.
  const summary = useMemo(() => (state.phase === 'player' && preview ? previewSummary(state, preview) : { mine: [], enemy: [] }), [state, preview])
  const amplifierItems = useMemo(() => amplifiers(state), [state])
  const intents = useMemo(() => {
    if (state.phase !== 'player' || !preview) return {}
    const texts = intentTexts(state, preview.enemy, nameOf, { withNumbers: false })
    const actions = intentActions(state, preview)
    return Object.fromEntries(Object.entries(texts).map(([id, text]) => [id, { text, actions: actions[id] ?? [] }]))
  }, [state, preview, nameOf])
  const states = useMemo(() => {
    if (state.phase !== 'player') return {}
    const detailed = Object.entries(lingeringStates(state)).map(([id, list]) => [id, list.map((s) => ({ text: s.text, detail: cardSummary(s.wordId, state.build) }))])
    return Object.fromEntries(detailed)
  }, [state])
  const projections = useMemo(() => finalHp(summary), [summary])
  const piles = useMemo(() => pileContents(state), [state])
  const drawPile = piles.draw.map((d) => ({ text: getWord(d.wordId).text, count: d.count }))
  const discardPile = piles.discard.map((id) => getWord(id).text)
  const verbPlaced = hasVerb(state.board)

  /** 배치 이외의 행동: 선택과 버리기 표시를 풀고 보낸다. */
  const run = (action: RallyAction) => {
    if (!canAct) return
    setSelectedId(null)
    setMarked(null)
    dispatch(action)
  }

  const place = (instanceId: string, at: SlotAddress, modifierIndex?: number) => {
    if (!canAct) return
    dispatch({ type: 'place', instanceId, at, modifierIndex })
    setSelectedId(null)
  }

  const onSelectCard = (id: string) => {
    if (marked) {
      if (id === BASIC_VERB_INSTANCE) return
      const next = new Set(marked)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setMarked(next)
      return
    }
    setSelectedId((current) => (current === id ? null : id))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const connect = (instanceId: string) => {
    if (!canAct) return
    dispatch({ type: 'connect', instanceId })
    setSelectedId(null)
  }
  const onConnectiveClick = () => {
    if (state.connective) run({ type: 'disconnect' })
    // 연결어가 아닌 카드도 엔진에 보내, 끌어다 놓을 때와 같은 거부 문구를 보인다.
    else if (selectedCard) connect(selectedCard.instanceId)
  }
  const sentenceEmpty =
    state.connective === null &&
    state.board.clauses.every((c) => c.slots.every((s) => isBlank(s.head) && s.modifiers.every((m) => m === null)))

  /** 놓은 내 단어를 뺀다(고른 카드가 없을 때 누르거나, 판 밖으로 끌 때). */
  const unplace = (at: SlotAddress, modifierIndex?: number) => run({ type: 'unplace', at, modifierIndex })
  const placedAt = (at: SlotAddress, modifierIndex?: number) => {
    const slot = getSlot(state.board, at)
    const word = modifierIndex === undefined ? slot.head : slot.modifiers[modifierIndex]
    return word?.owner === 'player'
  }
  const onSlotClick = (at: SlotAddress, modifierIndex?: number) => {
    if (selectedCard) place(selectedCard.instanceId, at, modifierIndex)
    else if (placedAt(at, modifierIndex)) unplace(at, modifierIndex)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(false)
    const activeId = String(event.active.id)
    if (activeId.startsWith(PLACED_DRAG_PREFIX)) {
      // 놓은 단어를 끌었다: 판의 칸이 아닌 곳에 놓으면 뺀다. 칸 위면 그대로 둔다.
      const from = parseDropId(activeId.slice(PLACED_DRAG_PREFIX.length))
      const overSlot = event.over ? parseDropId(String(event.over.id)) !== null || String(event.over.id) === CONNECTIVE_DROP_ID : false
      if (from && !overSlot) unplace(from.at, from.modifierIndex)
      setSelectedId(null)
      return
    }
    if (event.over && String(event.over.id) === CONNECTIVE_DROP_ID) {
      connect(String(event.active.id))
      return
    }
    const target = event.over ? parseDropId(String(event.over.id)) : null
    if (target) place(String(event.active.id), target.at, target.modifierIndex)
    else setSelectedId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        setDragging(true)
        setSelectedId(String(e.active.id).startsWith(PLACED_DRAG_PREFIX) ? null : String(e.active.id))
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDragging(false)
        setSelectedId(null)
      }}
    >
      <IntoHeader>
        <CombatChips drawPile={drawPile} discardPile={discardPile} emptyDrawHpLoss={piles.emptyDrawHpLoss} turn={state.turn} amplifiers={amplifierItems} />
      </IntoHeader>
      <main className="grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-2.5 px-3 pb-3 pt-2.5 short:gap-1.5 short:px-1.5 short:pb-1.5 short:pt-1.5">
        <Battlefield
          entities={state.entities}
          portraits={portraits}
          targetId={state.targetId}
          intents={intents}
          states={states}
          projections={projections}
          onPickEnemy={canAct ? (entityId) => run({ type: 'target', entityId }) : null}
        />
        {/* 문장판: 가운데 문장·계산식·알림, 양쪽 벽에 서랍(왼쪽 자원, 오른쪽 미리보기 상세). */}
        <section data-testid="board-panel" className="relative min-h-0 overflow-hidden rounded-2xl bg-surface-container-low shadow-xl">
          <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 px-14 py-2 short:gap-1 short:px-11 short:py-1.5">
            <SentenceBoard
              board={state.board}
              nameOf={nameOf}
              selectedWordId={selectedCard?.wordId ?? null}
              onHeadClick={(at) => onSlotClick(at)}
              onModifierClick={(at, index) => onSlotClick(at, index)}
              omitsObject={(clause) => omitsObject(state, clause)}
              connective={state.connective}
              connectivePlaceable={selectedCard !== null && state.connective === null && isConnectiveWord(selectedCard.wordId)}
              onConnectiveClick={onConnectiveClick}
            />
            <div data-testid="formula">
              <FormulaChips calcs={calcs} placeholder={verbPlaced ? '이 동사에는 계산식이 없습니다' : '동사를 놓으면 계산식이 보입니다'} />
            </div>
            <p className="flex h-5 items-center gap-1 text-center font-ui text-sm text-error" data-testid="message">
              {notice && <Icon name="info" className="text-[16px]" />}
              {notice}
            </p>
          </div>
          <Drawer side="left" icon="inventory_2" label="자원" width={300} testId="drawer-resources" hoverDisabled={dragging}>
            <ResourcePanel amplifiers={amplifierItems} drawPile={drawPile} discardPile={discardPile} emptyDrawHpLoss={piles.emptyDrawHpLoss} />
          </Drawer>
          <Drawer side="right" icon="visibility" label="미리보기" width={320} testId="drawer-preview" hoverDisabled={dragging}>
            <SidePanel mine={summary.mine} enemy={summary.enemy} canCast={verbPlaced} winsNow={preview?.after.phase === 'won'} />
          </Drawer>
        </section>
        <section className="flex items-end gap-3 short:gap-2">
          <Hand
            hand={state.deck.hand}
            build={state.build}
            board={state.board}
            selectedId={selectedId}
            marked={marked}
            disabled={!canAct}
            onSelect={onSelectCard}
            basic={{ wordId: state.build.basicVerb, available: basicVerbAvailable(state) }}
          />
          <ActionColumn
            canAct={canAct}
            canCast={verbPlaced}
            sentenceEmpty={sentenceEmpty}
            discardsLeft={state.discardsLeft}
            markedCount={marked ? marked.size : null}
            onCast={() => run({ type: 'cast' })}
            onEndTurn={() => run({ type: 'endTurn' })}
            onToggleDiscard={() => {
              setSelectedId(null)
              setMarked((current) => (current ? null : new Set()))
            }}
            onConfirmDiscard={() => marked && run({ type: 'discard', instanceIds: [...marked] })}
            onClear={() => run({ type: 'clear' })}
          />
        </section>
      </main>
      {onRestart && state.phase !== 'player' && !busy && <CombatResult outcome={state.phase} onRestart={onRestart} />}
    </DndContext>
  )
}
