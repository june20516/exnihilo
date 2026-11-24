import { CHARACTERS, DEFAULT_CHARACTER } from '@/game/content/characters'
import { useState } from 'react'
import { PLAYER_POOL, type WordDef, type WordId } from '@/game/content/words'
import type { WordKind } from '@/game/grammar/frames'
import { describeWord } from './describe'
import { DECK_LIMITS, validateDeck } from './deck'
import { KIND_LABELS, KIND_STYLES } from './wordStyle'

const GROUPS: { title: string; kinds: readonly WordKind[] }[] = [
  { title: '대상', kinds: ['target'] },
  { title: '타동사', kinds: ['verbTransitive'] },
  { title: '자동사', kinds: ['verbIntransitive'] },
  { title: '형용사', kinds: ['adjective'] },
  { title: '부사', kinds: ['adverb'] },
  { title: '연결어', kinds: ['connective'] },
]

interface DeckEditorProps {
  deck: readonly WordId[]
  onSave: (deck: WordId[]) => void
  onClose: () => void
}

function countOf(deck: readonly WordId[], id: WordId): number {
  return deck.filter((x) => x === id).length
}

export function DeckEditor({ deck, onSave, onClose }: DeckEditorProps) {
  const [draft, setDraft] = useState<WordId[]>([...deck])
  const validation = validateDeck(draft)
  const add = (id: WordId) => setDraft((d) => [...d, id])
  const remove = (id: WordId) =>
    setDraft((d) => {
      const index = d.lastIndexOf(id)
      return index < 0 ? d : [...d.slice(0, index), ...d.slice(index + 1)]
    })

  const row = (word: WordDef) => {
    const n = countOf(draft, word.id)
    return (
      <li
        key={word.id}
        className="flex items-center gap-2 rounded bg-surface-container px-2 py-1"
        data-testid={`pool-${word.id}`}
      >
        <span className={`w-24 font-card text-sm font-bold ${KIND_STYLES[word.kind].text}`}>{word.text}</span>
        <span className="flex-1 truncate text-[11px] text-on-surface-variant" title={describeWord(word)}>
          {describeWord(word)}
        </span>
        <button
          type="button"
          data-testid={`minus-${word.id}`}
          onClick={() => remove(word.id)}
          disabled={n === 0}
          className="h-6 w-6 rounded bg-surface-container-high disabled:opacity-30"
        >
          −
        </button>
        <span className="w-4 text-center font-ui text-sm">{n}</span>
        <button
          type="button"
          data-testid={`plus-${word.id}`}
          onClick={() => add(word.id)}
          className="h-6 w-6 rounded bg-surface-container-high"
        >
          ＋
        </button>
      </li>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur"
      data-testid="deck-editor"
    >
      <div className="flex h-[85vh] w-[1100px] flex-col gap-3 rounded-xl bg-surface-container-low p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-prose text-xl font-bold">덱 편집</h2>
          <span
            className={`font-ui text-sm ${validation.ok ? 'text-tertiary' : 'text-error'}`}
            data-testid="deck-count"
          >
            {draft.length}장 ({DECK_LIMITS.min}~{DECK_LIMITS.max}) {validation.ok ? '' : `· ${validation.reason}`}
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-y-auto">
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-1">
              <h3 className="font-ui text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                {group.title} ({KIND_LABELS[group.kinds[0]]})
              </h3>
              <ul className="flex flex-col gap-1">
                {PLAYER_POOL.filter((w) => group.kinds.includes(w.kind)).map(row)}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDraft([...CHARACTERS[DEFAULT_CHARACTER].starterDeck])}
            className="rounded-lg bg-surface-container-high px-4 py-2 text-sm"
          >
            시작 덱으로
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-surface-container-high px-4 py-2 text-sm">
            취소
          </button>
          <button
            type="button"
            data-testid="deck-save"
            disabled={!validation.ok}
            onClick={() => onSave(draft)}
            className="rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-on-primary-container disabled:opacity-40"
          >
            저장하고 다시 시작
          </button>
        </div>
      </div>
    </div>
  )
}
