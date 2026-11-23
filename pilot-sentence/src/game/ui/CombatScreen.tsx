import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { useCombatStore } from '@/app/useCombatStore'
import { ENCOUNTERS, type SlotAddress } from '@/game/content/encounters'
import type { RuleConfig } from '@/game/content/rules'
import { getWord, type WordId } from '@/game/content/words'
import { turnsUntilEnemyCast, upcomingIntents } from '@/game/combat/combat'
import type { RejectReason } from '@/game/combat/events'
import type { CombatAction } from '@/game/combat/combat'
import { previewEnemyCast, previewExecution } from '@/game/combat/preview'
import type { PlacedWord } from '@/game/sentence/board'
import { Battlefield } from './Battlefield'
import { CombatResult } from './CombatResult'
import { ControlPanel } from './ControlPanel'
import { Hand } from './Hand'
import { parseDropId } from './placement'
import { SentenceBoard } from './SentenceBoard'
import { SidePanel } from './SidePanel'

const REJECT_MESSAGES: Record<RejectReason, string> = {
  kindMismatch: '그 자리에는 이 품사를 놓을 수 없습니다.',
  modifiersFull: '수식어 칸이 가득 찼습니다. 바꿀 칸을 직접 고르세요.',
  slotInactive: '자동사 문장에는 목적어가 없습니다.',
  notEnoughAp: '자원이 부족합니다.',
  unplayable: '사용할 수 없는 단어입니다.',
  noTarget: '대상을 고르세요.',
  notPlayerTurn: '지금은 행동할 수 없습니다.',
  noSwapLeft: '이번 턴에는 더 뒤바꿀 수 없습니다.',
  slotSealed: '봉인된 슬롯은 뒤바꿀 수 없습니다.',
  noPaidDraw: '이 규칙에서는 추가로 뽑을 수 없습니다.',
  deckEmpty: '뽑을 카드가 없습니다.',
  cannotCast: '이 규칙에서는 낭독하지 않습니다(매 턴 자동 실행).',
}

interface PendingPlacement {
  readonly instanceId: string
  readonly at: SlotAddress
  readonly modifierIndex?: number
}

interface CombatScreenProps {
  encounterId: string
  seed: number
  rules: RuleConfig
  deck: readonly WordId[]
  onRestart: () => void
}

export function CombatScreen({ encounterId, seed, rules, deck, onRestart }: CombatScreenProps) {
  const { state, busy, lastEvents, dispatch } = useCombatStore(encounterId, seed, rules, deck)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingPlacement | null>(null)

  const portraits = useMemo(() => {
    const map: Record<string, string> = { player: '/assets/explorer.jpg' }
    for (const enemy of ENCOUNTERS[encounterId].enemies) map[enemy.defId] = enemy.portrait
    return map
  }, [encounterId])

  const nameOf = (word: PlacedWord) =>
    (word.targetEntityId && state.entities.find((e) => e.id === word.targetEntityId)?.name) || getWord(word.wordId).text
  const canAct = state.phase === 'player' && !busy
  const selectedCard = state.deck.hand.find((c) => c.instanceId === selectedId) ?? null
  const aliveEnemies = state.entities.filter((e) => e.side === 'enemy' && e.hp > 0)
  const rejected = lastEvents.find((e) => e.type === 'rejected')
  const preview = useMemo(() => (state.phase === 'player' ? previewExecution(state) : []), [state])
  const enemyCastPreview = useMemo(() => (state.phase === 'player' ? previewEnemyCast(state) : null), [state])

  /** 배치 이외의 행동: 선택과 지목 대기 상태를 풀고 보낸다. */
  const run = (action: CombatAction) => {
    if (!canAct) return
    setSelectedId(null)
    setPending(null)
    dispatch(action)
  }

  const place = (instanceId: string, at: SlotAddress, modifierIndex?: number) => {
    if (!canAct) return
    const card = state.deck.hand.find((c) => c.instanceId === instanceId)
    const def = card ? getWord(card.wordId) : null
    const needsTarget =
      def?.effect.type === 'target' && def.effect.ref.kind === 'chosenEnemy' && aliveEnemies.length > 1
    if (needsTarget) {
      setPending({ instanceId, at, modifierIndex })
    } else {
      dispatch({ type: 'place', instanceId, at, modifierIndex })
    }
    setSelectedId(null)
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
          onPickEnemy={
            pending
              ? (entityId) => {
                  // 연출 중에는 대기 상태를 유지한다(누른 것이 조용히 사라지지 않도록)
                  if (!canAct) return
                  dispatch({ type: 'place', ...pending, targetEntityId: entityId })
                  setPending(null)
                }
              : null
          }
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
            <p className="h-5 text-center text-sm text-error" data-testid="message">
              {rejected && rejected.type === 'rejected' ? REJECT_MESSAGES[rejected.reason] : ''}
            </p>
          </div>
          <SidePanel
            intents={state.phase === 'player' ? upcomingIntents(state) : []}
            enemyCastIn={turnsUntilEnemyCast(state)}
            preview={preview}
            previewTitle={rules.execution === 'cast' ? '지금 낭독하면' : '이번 턴 끝에 일어날 일 (개입 반영)'}
            secondaryPreview={enemyCastPreview}
            secondaryTitle="낭독 없이 턴을 끝내면 (적 낭독, 개입 반영)"
          />
        </div>
        <section className="flex items-end gap-3 rounded-xl bg-surface-container-lowest p-2 shadow-2xl">
          <ControlPanel
            rules={rules}
            resource={state.resource}
            swapsLeft={state.swapsLeft}
            drawCount={state.deck.drawPile.length}
            discardCount={state.deck.discardPile.length}
            turn={state.turn}
            disabled={!canAct}
            onSwap={() => run({ type: 'swap', clause: 0 })}
            onDrawPaid={() => run({ type: 'drawPaid' })}
          />
          <Hand
            hand={state.deck.hand}
            board={state.board}
            resource={state.resource}
            selectedId={selectedId}
            disabled={!canAct}
            onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
          />
          <div className="flex w-44 shrink-0 flex-col gap-2">
            {rules.execution === 'cast' && (
              <button
                type="button"
                data-testid="cast"
                disabled={!canAct}
                onClick={() => run({ type: 'cast' })}
                className="h-16 rounded-xl bg-secondary-container px-4 font-headline text-xl font-black text-on-secondary-container shadow-xl disabled:opacity-50"
              >
                낭독
              </button>
            )}
            <button
              type="button"
              data-testid="end-turn"
              disabled={!canAct}
              onClick={() => run({ type: 'endTurn' })}
              className="flex h-20 flex-col items-start justify-center rounded-xl bg-primary-container px-4 text-on-primary-container shadow-2xl transition active:scale-95 disabled:opacity-50"
            >
              <span className="font-headline text-2xl font-black">턴 종료</span>
              <span className="text-xs opacity-80">
                {rules.execution === 'cast' ? '낭독 없이 넘긴다' : '문장 현실화'}
              </span>
            </button>
          </div>
        </section>
      </main>
      {state.phase !== 'player' && !busy && <CombatResult outcome={state.phase} onRestart={onRestart} />}
    </DndContext>
  )
}
