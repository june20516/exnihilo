import { useState } from 'react'
import { PRESETS, type PresetId } from '@/game/content/rules'
import type { WordId } from '@/game/content/words'
import { CombatScreen } from '@/game/ui/CombatScreen'
import { DECK_STORAGE_KEY, loadDeck } from '@/game/ui/deck'
import { DeckEditor } from '@/game/ui/DeckEditor'
import { TopBar } from '@/game/ui/TopBar'

function readInitialSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed')
  const parsed = param === null ? Number.NaN : Number.parseInt(param, 10)
  return Number.isFinite(parsed) ? parsed : Date.now() % 1_000_000_000
}

function readInitialPreset(): PresetId {
  const param = new URLSearchParams(window.location.search).get('preset')
  return param === 'A' || param === 'B' || param === 'C' ? param : 'B'
}

export default function App() {
  const [presetId, setPresetId] = useState<PresetId>(readInitialPreset)
  const [encounterId, setEncounterId] = useState('spider')
  const [seed, setSeed] = useState(readInitialSeed)
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
    <div className="grid h-screen grid-rows-[auto_1fr] overflow-hidden bg-surface-container-lowest">
      <TopBar
        presetId={presetId}
        encounterId={encounterId}
        seed={seed}
        deckSize={deck.length}
        onPreset={(id) => setPresetId(id)}
        onEncounter={(id) => setEncounterId(id)}
        onRestart={() => setSeed((s) => s + 1)}
        onOpenDeck={() => setDeckOpen(true)}
      />
      <CombatScreen
        key={`${presetId}:${encounterId}:${seed}:${round}`}
        encounterId={encounterId}
        seed={seed}
        rules={PRESETS[presetId]}
        deck={deck}
        onRestart={() => setSeed((s) => s + 1)}
      />
      {deckOpen && <DeckEditor deck={deck} onSave={saveDeck} onClose={() => setDeckOpen(false)} />}
    </div>
  )
}
