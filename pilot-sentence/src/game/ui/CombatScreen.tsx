import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { RALLY_ENCOUNTERS, type SlotAddress } from '@/game/content/enemies'
import { BALANCE } from '@/game/content/balance'
import type { CombatEvent } from '@/game/combat/events'
import type { RallyAction, RallyState } from '@/game/rally/combat'
import { sentenceFormula } from '@/game/rally/formula'
import { linesFromEvents } from '@/game/rally/lines'
import { previewEvents } from '@/game/rally/preview'
import { hasVerb, isBlank } from '@/game/rally/sentence'
import { intentTexts, REJECT_MESSAGES, wordNamer } from '@/game/rally/text'
import { Battlefield } from './Battlefield'
import { CombatResult } from './CombatResult'
import { ControlPanel } from './ControlPanel'
import { Hand } from './Hand'
import { CONNECTIVE_DROP_ID, isConnectiveWord, parseDropId } from './placement'
import { SentenceBoard } from './SentenceBoard'
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

  const selectedCard = state.deck.hand.find((c) => c.instanceId === selectedId) ?? null
  const rejected = lastEvents.find((e) => e.type === 'rejected')
  const preview = useMemo(() => (state.phase === 'player' ? previewEvents(state, BALANCE) : null), [state])
  const formulas = useMemo(() => (state.phase === 'player' ? sentenceFormula(state) : []), [state])
  const intents = state.phase === 'player' && preview ? intentTexts(state, preview.enemy, nameOf) : {}
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

  const handleDragEnd = (event: DragEndEvent) => {
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
      onDragStart={(e) => setSelectedId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setSelectedId(null)}
    >
      <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 p-2">
        <Battlefield
          entities={state.entities}
          portraits={portraits}
          targetId={state.targetId}
          intents={intents}
          onPickEnemy={canAct ? (entityId) => run({ type: 'target', entityId }) : null}
        />
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-2">
          <div className="flex min-h-0 flex-col gap-1">
            <SentenceBoard
              board={state.board}
              nameOf={nameOf}
              selectedWordId={selectedCard?.wordId ?? null}
              onHeadClick={(at) => selectedCard && place(selectedCard.instanceId, at)}
              onModifierClick={(at, index) => selectedCard && place(selectedCard.instanceId, at, index)}
              connective={state.connective}
              connectivePlaceable={selectedCard !== null && state.connective === null && isConnectiveWord(selectedCard.wordId)}
              onConnectiveClick={onConnectiveClick}
            />
            <p
              data-testid="formula"
              className="text-center font-headline text-lg font-bold text-secondary"
            >
              {formulas.length > 0
                ? formulas.map((f) => (
                    <span key={f.clause} data-clause={f.clause} className="block">
                      {state.board.clauses.length > 1 ? `절 ${f.clause + 1}: ` : ''}
                      {f.text}
                    </span>
                  ))
                : verbPlaced
                  ? '이 동사에는 계산식이 없습니다'
                  : '동사를 놓으면 계산식이 보입니다'}
            </p>
            <p className="h-5 text-center text-sm text-error" data-testid="message">
              {rejected && rejected.type === 'rejected' ? REJECT_MESSAGES[rejected.reason] : ''}
            </p>
          </div>
          <SidePanel
            mine={preview ? linesFromEvents(preview.mine, preview.after.entities) : []}
            enemy={preview ? linesFromEvents(preview.enemy, preview.after.entities) : []}
            canCast={verbPlaced}
            winsNow={preview?.after.phase === 'won'}
          />
        </div>
        <section className="flex items-end gap-3 rounded-xl bg-surface-container-lowest p-2 shadow-2xl">
          <ControlPanel
            drawCount={state.deck.drawPile.length}
            discardCount={state.deck.discardPile.length}
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
          <Hand
            hand={state.deck.hand}
            board={state.board}
            selectedId={selectedId}
            marked={marked}
            disabled={!canAct}
            onSelect={onSelectCard}
          />
          <div className="flex w-44 shrink-0 flex-col gap-2">
            <button
              type="button"
              data-testid="cast"
              disabled={!canAct || !verbPlaced}
              onClick={() => run({ type: 'cast' })}
              className="h-16 rounded-xl bg-secondary-container px-4 font-headline text-xl font-black text-on-secondary-container shadow-xl disabled:opacity-50"
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
              <span className="font-headline text-lg font-black">턴 종료</span>
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
