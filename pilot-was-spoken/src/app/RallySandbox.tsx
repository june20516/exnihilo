import { useState } from 'react'
import type { WordId } from '@/game/content/words'
import { CombatScreen } from '@/game/ui/CombatScreen'
import { DECK_STORAGE_KEY, loadDeck } from '@/game/ui/deck'
import { DeckEditor } from '@/game/ui/DeckEditor'
import { TopBar } from '@/game/ui/TopBar'
import { useCombatStore } from './useCombatStore'

interface RallyProps {
  encounterId: string
  seed: number
  deck: readonly WordId[]
  onRestart: () => void
}

/** 조우·시드·덱이 바뀌면 key로 새로 마운트되어 전투를 새로 시작한다. */
function RallyCombat({ encounterId, seed, deck, onRestart }: RallyProps) {
  const store = useCombatStore(encounterId, seed, deck)
  return <CombatScreen state={store.shown} busy={store.busy} lastEvents={store.lastEvents} dispatch={store.dispatch} onRestart={onRestart} />
}

/** 샌드박스(?mode=rally): 적을 골라 전투 한 판, 덱을 직접 편집한다. 런과 덱을 공유하지 않는다. */
export function RallySandbox({ initialSeed }: { initialSeed: number }) {
  const [encounterId, setEncounterId] = useState('spider')
  const [seed, setSeed] = useState(initialSeed)
  const [deck, setDeck] = useState<WordId[]>(() => loadDeck(window.localStorage.getItem(DECK_STORAGE_KEY)))
  const [deckOpen, setDeckOpen] = useState(false)
  const [round, setRound] = useState(0)

  const saveDeck = (next: WordId[]) => {
    window.localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(next))
    setDeck(next)
    setDeckOpen(false)
    setRound((r) => r + 1)
  }

  return (
    <div className="grid h-full grid-rows-[auto_1fr] overflow-hidden bg-surface-container-lowest">
      <TopBar
        encounterId={encounterId}
        seed={seed}
        deckSize={deck.length}
        onEncounter={(id) => setEncounterId(id)}
        onRestart={() => setSeed((s) => s + 1)}
        onOpenDeck={() => setDeckOpen(true)}
      />
      <RallyCombat
        key={`${encounterId}:${seed}:${round}`}
        encounterId={encounterId}
        seed={seed}
        deck={deck}
        onRestart={() => setSeed((s) => s + 1)}
      />
      {deckOpen && <DeckEditor deck={deck} onSave={saveDeck} onClose={() => setDeckOpen(false)} />}
    </div>
  )
}
