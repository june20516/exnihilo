import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { useCombatStore } from '@/app/useCombatStore'
import { BALANCE } from '@/game/content/balance'
import { ENCOUNTERS, type SlotAddress } from '@/game/content/encounters'
import { getWord } from '@/game/content/words'
import { currentIntent } from '@/game/combat/combat'
import type { RejectReason } from '@/game/combat/events'
import type { PlacedWord } from '@/game/sentence/board'
import { ApMeter } from './ApMeter'
import { Battlefield } from './Battlefield'
import { CombatResult } from './CombatResult'
import { Hand } from './Hand'
import { Icon } from './Icon'
import { parseDropId } from './placement'
import { SentenceBoard } from './SentenceBoard'

const REJECT_MESSAGES: Record<RejectReason, string> = {
  kindMismatch: '그 자리에는 이 품사를 놓을 수 없습니다.',
  modifiersFull: '수식어 칸이 가득 찼습니다. 바꿀 칸을 직접 고르세요.',
  notEnoughAp: '행동력이 부족합니다.',
  unplayable: '사용할 수 없는 단어입니다.',
  noTarget: '대상을 고를 수 없습니다.',
  notPlayerTurn: '지금은 행동할 수 없습니다.',
}

interface CombatScreenProps {
  encounterId: string
  seed: number
}

export function CombatScreen({ encounterId, seed: initialSeed }: CombatScreenProps) {
  const { state, busy, seed, lastEvents, dispatch, restart } = useCombatStore(encounterId, initialSeed)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const portraits = useMemo(() => {
    const map: Record<string, string> = { player: '/assets/explorer.jpg' }
    for (const enemy of ENCOUNTERS[encounterId].enemies) map[enemy.defId] = enemy.portrait
    return map
  }, [encounterId])

  const nameOf = (word: PlacedWord) =>
    (word.targetEntityId && state.entities.find((e) => e.id === word.targetEntityId)?.name) || getWord(word.wordId).text

  const selectedCard = state.deck.hand.find((c) => c.instanceId === selectedId) ?? null
  const rejected = lastEvents.find((e) => e.type === 'rejected')
  const canAct = state.phase === 'player' && !busy

  const placeAt = (at: SlotAddress, modifierIndex?: number) => {
    if (!selectedCard || !canAct) return
    dispatch({ type: 'place', instanceId: selectedCard.instanceId, at, modifierIndex })
    setSelectedId(null)
  }

  // 6px 이상 움직여야 드래그로 본다. 그보다 짧으면 클릭 배치로 처리된다.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const instanceId = String(event.active.id)
    const target = event.over ? parseDropId(String(event.over.id)) : null
    if (target && canAct) dispatch({ type: 'place', instanceId, at: target.at, modifierIndex: target.modifierIndex })
    setSelectedId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setSelectedId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setSelectedId(null)}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
        <Battlefield
          entities={state.entities}
          portraits={portraits}
          intent={state.phase === 'player' ? currentIntent(state) : null}
        />
        <SentenceBoard
          board={state.board}
          nameOf={nameOf}
          selectedWordId={selectedCard?.wordId ?? null}
          onHeadClick={(at) => placeAt(at)}
          onModifierClick={(at, index) => placeAt(at, index)}
        />
        <p className="h-5 text-center text-sm text-error" data-testid="message">
          {rejected && rejected.type === 'rejected' ? REJECT_MESSAGES[rejected.reason] : ''}
        </p>
        <section className="flex items-end justify-between gap-4 rounded-xl bg-surface-container-lowest p-4 shadow-2xl">
          <div className="flex flex-col gap-4">
            <ApMeter ap={state.ap} max={BALANCE.apPerTurn} />
            <div className="flex gap-3 font-label text-sm text-on-surface-variant">
              <span className="flex items-center gap-1">
                <Icon name="auto_stories" className="text-[16px] text-secondary" />
                서고 {state.deck.drawPile.length}
              </span>
              <span className="flex items-center gap-1" data-testid="discard">
                <Icon name="history_edu" className="text-[16px]" />
                망각 {state.deck.discardPile.length}
              </span>
              <span>턴 {state.turn}</span>
            </div>
          </div>
          <Hand
            hand={state.deck.hand}
          board={state.board}
            selectedId={selectedId}
            disabled={!canAct}
            onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
          />
          <button
            type="button"
            data-testid="end-turn"
            disabled={!canAct}
            onClick={() => {
              setSelectedId(null)
              dispatch({ type: 'endTurn' })
            }}
            className="flex h-24 w-48 flex-col items-start justify-center rounded-xl bg-primary-container px-5 text-on-primary-container shadow-2xl transition active:scale-95 disabled:opacity-50"
          >
            <span className="font-label text-[10px] font-black uppercase tracking-widest text-on-primary">
              시련 집행
            </span>
            <span className="font-headline text-3xl font-black">턴 종료</span>
            <span className="text-xs opacity-80">문장 현실화</span>
          </button>
        </section>
        <span className="fixed bottom-2 right-3 font-label text-xs text-outline" data-testid="seed">
          seed {seed}
        </span>
        {state.phase !== 'player' && !busy && <CombatResult outcome={state.phase} onRestart={() => restart()} />}
      </div>
    </DndContext>
  )
}
