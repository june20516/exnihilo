import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import { HeaderSlot } from './HeaderSlot'
import { Icon } from './Icon'

interface TopBarProps {
  encounterId: string
  seed: number
  deckSize: number
  onEncounter: (id: string) => void
  onRestart: () => void
  onOpenDeck: () => void
}

export function TopBar(props: TopBarProps) {
  const { encounterId, seed, deckSize, onEncounter, onRestart, onOpenDeck } = props
  return (
    <header className="flex h-12 items-center justify-between gap-4 bg-surface-container-low px-4 shadow-md short:h-11">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 font-prose text-lg font-bold">문장 던전</span>
        <span className="shrink-0 font-ui text-[10px] uppercase tracking-widest text-on-surface-variant">기본 랠리</span>
        <HeaderSlot />
      </div>
      <div className="flex items-center gap-2">
        <select
          data-testid="encounter"
          value={encounterId}
          onChange={(e) => onEncounter(e.target.value)}
          className="rounded-lg bg-surface-container-high px-2 py-1 text-sm"
        >
          {Object.values(RALLY_ENCOUNTERS)
            .filter((e) => !e.id.startsWith('test-'))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          data-testid="open-deck"
          onClick={onOpenDeck}
          className="flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-1 text-sm"
        >
          <Icon name="style" className="text-[16px]" />덱 {deckSize}장
        </button>
        <button
          type="button"
          data-testid="restart"
          onClick={onRestart}
          className="flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-1 text-sm"
        >
          <Icon name="refresh" className="text-[16px]" />
          다시
        </button>
        <span className="font-ui text-xs text-outline" data-testid="seed">
          seed {seed}
        </span>
      </div>
    </header>
  )
}
