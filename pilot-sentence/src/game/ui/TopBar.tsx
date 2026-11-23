import { ENCOUNTERS } from '@/game/content/encounters'
import { PRESETS, type PresetId } from '@/game/content/rules'
import { Icon } from './Icon'

interface TopBarProps {
  presetId: PresetId
  encounterId: string
  seed: number
  deckSize: number
  onPreset: (id: PresetId) => void
  onEncounter: (id: string) => void
  onRestart: () => void
  onOpenDeck: () => void
}

export function TopBar(props: TopBarProps) {
  const { presetId, encounterId, seed, deckSize, onPreset, onEncounter, onRestart, onOpenDeck } = props
  return (
    <header className="flex h-12 items-center justify-between gap-4 bg-surface-container-low px-4 shadow-md">
      <div className="flex items-center gap-3">
        <span className="font-headline text-lg font-bold">문장 던전</span>
        <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">규칙 샌드박스</span>
      </div>
      <div className="flex items-center gap-2" role="group" aria-label="프리셋">
        {Object.values(PRESETS).map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`preset-${preset.id}`}
            onClick={() => onPreset(preset.id)}
            className={`rounded-lg px-3 py-1 font-label text-xs font-bold transition ${
              preset.id === presetId
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            {preset.id}. {preset.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select
          data-testid="encounter"
          value={encounterId}
          onChange={(e) => onEncounter(e.target.value)}
          className="rounded-lg bg-surface-container-high px-2 py-1 text-sm"
        >
          {Object.values(ENCOUNTERS)
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
        <span className="font-label text-xs text-outline" data-testid="seed">
          seed {seed}
        </span>
      </div>
    </header>
  )
}
