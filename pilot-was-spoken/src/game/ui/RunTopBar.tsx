import { PLAYER_DEF_ID } from '@/game/content/characters'
import { useState } from 'react'
import { type EncounterTier, RALLY_ENCOUNTERS } from '@/game/content/enemies'
import { FLOORS } from '@/game/run/floors'
import type { RunState } from '@/game/run/run'
import { HeaderSlot } from './HeaderSlot'
import { Icon } from './Icon'

const TIER_NAMES: Record<EncounterTier, string> = { normal: '일반', elite: '정예', boss: '보스' }

interface RunTopBarProps {
  state: RunState
  /** 연출 재생 중이면 새 런을 막는다. */
  busy: boolean
  onNewRun: () => void
  /** 조작 안내를 다시 연다. */
  onHowToPlay: () => void
}

/** 런 상단: 층(3/7 · 정예), HP, 화폐, 조작 안내, 새 런, 시드. 전투 중이면 HP는 전투의 탐험가 HP다. */
export function RunTopBar({ state, busy, onNewRun, onHowToPlay }: RunTopBarProps) {
  /** 새 런은 두 번 눌러야 시작한다(진행 중인 런을 실수로 버리지 않게). */
  const [armed, setArmed] = useState(false)
  const floor = FLOORS[state.floor - 1]
  const player = state.phase === 'combat' ? state.combat?.entities.find((e) => e.side === 'ally' && e.defId === PLAYER_DEF_ID) : null
  const encounter = state.phase === 'combat' && state.combat ? RALLY_ENCOUNTERS[state.combat.encounterId]?.name : null
  return (
    <header className="flex h-12 items-center justify-between gap-4 bg-surface-container-low px-4 shadow-md short:h-11">
      <div className="flex min-w-0 items-center gap-4">
        <span className="shrink-0 font-prose text-lg font-bold">문장 던전</span>
        <span className="flex shrink-0 items-center gap-1 font-ui text-base font-bold text-secondary" data-testid="run-floor">
          <Icon name="stairs" className="text-[20px]" />
          {state.floor}/{FLOORS.length} · {floor ? TIER_NAMES[floor.tier] : ''}
          {encounter ? ` · ${encounter}` : ''}
        </span>
        <HeaderSlot />
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1 text-sm font-bold text-primary" data-testid="run-hp">
          <Icon name="favorite" className="text-[20px]" />
          HP <b className="font-number text-lg font-normal">{player?.hp ?? state.hp} / {player?.maxHp ?? state.maxHp}</b>
        </span>
        <span className="flex items-center gap-1 text-sm font-bold text-secondary" data-testid="run-gold">
          <Icon name="paid" className="text-[20px]" />
          화폐 <b className="font-number text-lg font-normal">{state.gold}</b>
        </span>
        <button
          type="button"
          data-testid="how-to-play-open"
          title="플레이 방법"
          aria-label="플레이 방법"
          onClick={onHowToPlay}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high"
        >
          <Icon name="help" className="text-[20px]" />
        </button>
        <button
          type="button"
          data-testid="new-run"
          disabled={busy}
          onClick={() => {
            if (!armed) {
              setArmed(true)
              return
            }
            setArmed(false)
            onNewRun()
          }}
          onBlur={() => setArmed(false)}
          className={`flex items-center gap-1 rounded-lg px-3 py-1 text-sm disabled:opacity-40 ${
            armed ? 'bg-error-container text-on-error-container' : 'bg-surface-container-high'
          }`}
        >
          <Icon name="refresh" className="text-[16px]" />
          {armed ? '한 번 더 누르면 새 런' : '새 런'}
        </button>
        <span className="font-ui text-xs text-outline" data-testid="run-seed">
          seed {state.seed}
        </span>
      </div>
    </header>
  )
}
