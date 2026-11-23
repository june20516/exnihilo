import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { useCombatStore } from '@/app/useCombatStore'
import { BALANCE } from '@/game/content/balance'
import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import type { SlotAddress } from '@/game/content/encounters'
import { getWord, type WordId } from '@/game/content/words'
import type { CombatEvent, RejectReason } from '@/game/combat/events'
import { renderClause } from '@/game/grammar/render'
import { enemyIntent, type RallyAction, type RallyState } from '@/game/rally/combat'
import { sentenceFormula } from '@/game/rally/formula'
import { linesFromEvents } from '@/game/rally/lines'
import { previewEvents } from '@/game/rally/preview'
import { enemyBoard, hasVerb, isBlank, materialize } from '@/game/rally/sentence'
import { getSlot, type PlacedWord } from '@/game/sentence/board'
import { Battlefield } from './Battlefield'
import { CombatResult } from './CombatResult'
import { ControlPanel } from './ControlPanel'
import { Hand } from './Hand'
import { parseDropId } from './placement'
import { SentenceBoard } from './SentenceBoard'
import { SidePanel } from './SidePanel'

const REJECT_MESSAGES: Partial<Record<RejectReason, string>> = {
  kindMismatch: '그 자리에는 이 품사를 놓을 수 없습니다.',
  modifiersFull: '수식어 칸이 가득 찼습니다. 바꿀 칸을 직접 고르세요.',
  slotInactive: '자동사 문장에는 목적어가 없습니다.',
  unplayable: '사용할 수 없는 단어입니다.',
  noTarget: '대상을 고르세요.',
  notPlayerTurn: '지금은 행동할 수 없습니다.',
  deckEmpty: '뽑을 카드가 없습니다.',
  noVerb: '동사가 있어야 낭독할 수 있습니다.',
  noDiscardLeft: '이번 턴에는 더 버릴 수 없습니다.',
}

interface CombatScreenProps {
  encounterId: string
  seed: number
  deck: readonly WordId[]
  onRestart: () => void
}

/** 렌더 토큰을 한 줄 문장으로: 단어 사이는 띄우고 조사는 붙인다. */
function joinTokens(tokens: ReturnType<typeof renderClause>): string {
  return tokens.reduce((text, token) => (token.kind === 'particle' || text === '' ? text + token.text : `${text} ${token.text}`), '')
}

/** 적 예고 문장과, 미리보기에서 그 적이 내는 수치(피해·보호 등). */
function intentTexts(state: RallyState, enemyEvents: readonly CombatEvent[], nameOf: (w: PlacedWord) => string): Record<string, string> {
  const texts: Record<string, string> = {}
  RALLY_ENCOUNTERS[state.encounterId]?.enemies.forEach((_, index) => {
    const id = `e${index}`
    const sentence = joinTokens(renderClause(enemyBoard(enemyIntent(state, index), id, BALANCE.maxModifiers), 0, nameOf))
    const numbers = enemyEvents.flatMap((e) => {
      if (e.type === 'damaged' && e.sourceId === id) return [`피해 ${e.amount + e.blocked}`]
      if (e.type === 'statusApplied' && e.entityId === id && e.status === 'block') return [`보호 +${e.amount}`]
      if (e.type === 'grew' && e.entityId === id) return [`최대 HP +${e.amount}`]
      return []
    })
    texts[id] = numbers.length > 0 ? `${sentence} — ${numbers.join(', ')}` : sentence
  })
  return texts
}

export function CombatScreen({ encounterId, seed, deck, onRestart }: CombatScreenProps) {
  const { state, busy, lastEvents, dispatch } = useCombatStore(encounterId, seed, deck)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 버리기 모드에서 표시한 카드. null이면 버리기 모드가 아니다. */
  const [marked, setMarked] = useState<ReadonlySet<string> | null>(null)

  const portraits = useMemo(() => {
    const map: Record<string, string> = { player: '/assets/explorer.jpg' }
    for (const enemy of RALLY_ENCOUNTERS[encounterId]?.enemies ?? []) map[enemy.defId] = enemy.portrait
    return map
  }, [encounterId])

  const canAct = state.phase === 'player' && !busy
  const entityName = (id: string | null) => (id && state.entities.find((e) => e.id === id)?.name) || null
  /** 빈칸은 낭독하면 채워질 실제 대상의 이름으로 보인다. */
  const shown = useMemo(() => materialize(state.board, state.targetId), [state.board, state.targetId])
  const nameOf = (word: PlacedWord) => {
    if (word.owner === 'blank' && word.wordId !== 'blankVerb') {
      const role = state.board.clauses[0]?.slots.find((s) => s.head === word)?.role
      const filled = role ? getSlot(shown, { clause: 0, role }).head : word
      const verbPlaced = hasVerb(state.board)
      if (role === 'object' && !verbPlaced) return entityName(state.targetId) ?? '대상'
      return entityName(filled.targetEntityId) ?? getWord(filled.wordId).text
    }
    return entityName(word.targetEntityId) ?? getWord(word.wordId).text
  }

  const selectedCard = state.deck.hand.find((c) => c.instanceId === selectedId) ?? null
  const rejected = lastEvents.find((e) => e.type === 'rejected')
  const preview = useMemo(() => (state.phase === 'player' ? previewEvents(state) : null), [state])
  const formula = useMemo(() => (state.phase === 'player' ? sentenceFormula(state) : null), [state])
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
  const handleDragEnd = (event: DragEndEvent) => {
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
            />
            <p
              data-testid="formula"
              className="text-center font-headline text-lg font-bold text-secondary"
            >
              {formula ? formula.text : verbPlaced ? '이 동사에는 계산식이 없습니다' : '동사를 놓으면 계산식이 보입니다'}
            </p>
            <p className="h-5 text-center text-sm text-error" data-testid="message">
              {rejected && rejected.type === 'rejected' ? (REJECT_MESSAGES[rejected.reason] ?? '') : ''}
            </p>
          </div>
          <SidePanel
            mine={preview ? linesFromEvents(preview.mine, preview.after.entities) : []}
            enemy={preview ? linesFromEvents(preview.enemy, preview.after.entities) : []}
            canCast={verbPlaced}
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
              disabled={!canAct || !state.board.clauses[0]?.slots.some((s) => !isBlank(s.head) || s.modifiers.some((m) => m !== null))}
              onClick={() => run({ type: 'clear' })}
              className="rounded-lg bg-surface-container-high px-3 py-1 text-xs font-bold disabled:opacity-40"
            >
              문장 비우기
            </button>
          </div>
        </section>
      </main>
      {state.phase !== 'player' && !busy && <CombatResult outcome={state.phase} onRestart={onRestart} />}
    </DndContext>
  )
}
