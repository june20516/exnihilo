import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { RALLY_ENCOUNTERS, type SlotAddress } from '@/game/content/enemies'
import type { CombatEvent } from '@/game/combat/events'
import { BASIC_VERB_INSTANCE, basicVerbAvailable, type RallyAction, type RallyState } from '@/game/rally/combat'
import { sentenceCalc } from '@/game/rally/formula'
import { previewEvents } from '@/game/rally/preview'
import { hasVerb, isBlank } from '@/game/rally/sentence'
import { amplifiers, intentActions, pileContents, previewSummary } from '@/game/rally/summary'
import { eventNotice, intentTexts, lingeringStates, omitsObject, wordNamer } from '@/game/rally/text'
import { getWord } from '@/game/content/words'
import { getSlot } from '@/game/sentence/board'
import { cardSummary } from './describe'
import { PLACED_DRAG_PREFIX } from './SlotView'
import { Battlefield } from './Battlefield'
import { CombatResult } from './CombatResult'
import { ControlPanel } from './ControlPanel'
import { Hand } from './Hand'
import { CONNECTIVE_DROP_ID, isConnectiveWord, parseDropId } from './placement'
import { SentenceBoard } from './SentenceBoard'
import { AmplifierPanel } from './AmplifierPanel'
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
  const summary = useMemo(() => (state.phase === 'player' ? previewSummary(state) : { mine: [], enemy: [] }), [state])
  const amplifierItems = useMemo(() => amplifiers(state), [state])
  const intents = useMemo(() => {
    if (state.phase !== 'player' || !preview) return {}
    const texts = intentTexts(state, preview.enemy, nameOf, { withNumbers: false })
    const actions = intentActions(state)
    return Object.fromEntries(Object.entries(texts).map(([id, text]) => [id, { text, actions: actions[id] ?? [] }]))
  }, [state, preview, nameOf])
  const states = useMemo(() => {
    if (state.phase !== 'player') return {}
    const detailed = Object.entries(lingeringStates(state)).map(([id, list]) => [id, list.map((s) => ({ text: s.text, detail: cardSummary(s.wordId, state.build) }))])
    return Object.fromEntries(detailed)
  }, [state])
  const piles = useMemo(() => pileContents(state), [state])
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
      onDragStart={(e) => setSelectedId(String(e.active.id).startsWith(PLACED_DRAG_PREFIX) ? null : String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setSelectedId(null)}
    >
      <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 p-2">
        <Battlefield
          entities={state.entities}
          portraits={portraits}
          targetId={state.targetId}
          intents={intents}
          states={states}
          onPickEnemy={canAct ? (entityId) => run({ type: 'target', entityId }) : null}
        />
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-2">
          <div className="flex min-h-0 flex-col gap-1">
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
            <p className="h-5 text-center text-sm text-error" data-testid="message">
              {notice}
            </p>
          </div>
          <SidePanel
            mine={summary.mine}
            enemy={summary.enemy}
            canCast={verbPlaced}
            winsNow={preview?.after.phase === 'won'}
          />
        </div>
        <section className="flex items-end gap-3 rounded-xl bg-surface-container-lowest p-2 shadow-2xl">
          <div className="flex w-56 shrink-0 flex-col gap-2">
          <AmplifierPanel items={amplifierItems} />
          <ControlPanel
            drawPile={piles.draw.map((d) => ({ text: getWord(d.wordId).text, count: d.count }))}
            discardPile={piles.discard.map((id) => getWord(id).text)}
            emptyDrawHpLoss={piles.emptyDrawHpLoss}
            turn={state.turn}
            discardsLeft={state.discardsLeft}
            markedCount={marked ? marked.size : null}
            disabled={!canAct}
            onToggleDiscard={() => {
              setSelectedId(null)
              setMarked((current) => (current ? null : new Set()))
            }}
            onConfirmDiscard={() => marked && run({ type: 'discard', instanceIds: [...marked] })}
          />
          </div>
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
          <div className="flex w-44 shrink-0 flex-col gap-2">
            <button
              type="button"
              data-testid="cast"
              disabled={!canAct || !verbPlaced}
              onClick={() => run({ type: 'cast' })}
              className="h-16 rounded-xl bg-secondary-container px-4 font-ui text-xl font-black text-on-secondary-container shadow-xl disabled:opacity-50"
            >
              낭독
            </button>
            <button
              type="button"
              data-testid="end-turn"
              disabled={!canAct}
              onClick={() => run({ type: 'endTurn' })}
              className="flex h-12 flex-col items-start justify-center rounded-xl bg-primary-container px-4 text-on-primary-container shadow-2xl transition active:scale-95 disabled:opacity-50"
            >
              <span className="font-ui text-lg font-black">턴 종료</span>
              <span className="text-[10px] opacity-80">낭독 없이 넘긴다</span>
            </button>
            <button
              type="button"
              data-testid="clear"
              disabled={!canAct || sentenceEmpty}
              onClick={() => run({ type: 'clear' })}
              className="rounded-lg bg-surface-container-high px-3 py-1 text-xs font-bold disabled:opacity-40"
            >
              문장 비우기
            </button>
          </div>
        </section>
      </main>
      {onRestart && state.phase !== 'player' && !busy && <CombatResult outcome={state.phase} onRestart={onRestart} />}
    </DndContext>
  )
}
