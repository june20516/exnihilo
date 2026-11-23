import { type EncounterTier, RALLY_ENCOUNTERS } from '@/game/content/enemies'
import { FLOORS } from '@/game/run/floors'
import type { RunState } from '@/game/run/run'
import { Icon } from './Icon'

const TIER_NAMES: Record<EncounterTier, string> = { normal: '일반', elite: '정예', boss: '보스' }

interface RunTopBarProps {
  state: RunState
  onNewRun: () => void
}

/** 런 상단: 층(3/7 · 정예), HP, 화폐, 시드, 새 런. 전투 중이면 HP는 전투의 탐험가 HP다. */
export function RunTopBar({ state, onNewRun }: RunTopBarProps) {
  const floor = FLOORS[state.floor - 1]
  const player = state.phase === 'combat' ? state.combat?.entities.find((e) => e.side === 'ally' && e.defId === 'player') : null
  const encounter = state.phase === 'combat' && state.combat ? RALLY_ENCOUNTERS[state.combat.encounterId]?.name : null
  return (
    <header className="flex h-12 items-center justify-between gap-4 bg-surface-container-low px-4 shadow-md">
      <div className="flex items-center gap-4">
        <span className="font-headline text-lg font-bold">문장 던전</span>
        <span className="font-headline text-base font-bold text-secondary" data-testid="run-floor">
          {state.floor}/{FLOORS.length} · {floor ? TIER_NAMES[floor.tier] : ''}
          {encounter ? ` · ${encounter}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1 text-sm font-bold text-error" data-testid="run-hp">
          <Icon name="favorite" className="text-[16px]" />
          HP {player?.hp ?? state.hp} / {player?.maxHp ?? state.maxHp}
        </span>
        <span className="flex items-center gap-1 text-sm font-bold text-secondary" data-testid="run-gold">
          <Icon name="paid" className="text-[16px]" />
          화폐 {state.gold}
        </span>
        <button
          type="button"
          data-testid="new-run"
          onClick={onNewRun}
          className="flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-1 text-sm"
        >
          <Icon name="refresh" className="text-[16px]" />새 런
        </button>
        <span className="font-label text-xs text-outline">seed {state.seed}</span>
      </div>
    </header>
  )
}
