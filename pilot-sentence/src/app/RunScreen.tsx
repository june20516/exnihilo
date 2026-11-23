import { useMemo } from 'react'
import { isCombatEvent } from '@/game/run/run'
import { CombatScreen } from '@/game/ui/CombatScreen'
import { RunResult } from '@/game/ui/RunResult'
import { RunTopBar } from '@/game/ui/RunTopBar'
import { ShopScreen } from '@/game/ui/ShopScreen'
import { useRunStore } from './useRunStore'

/**
 * 런 화면: 전투 → 상점 → … → 결과. 연출이 재생 중이면 전투 화면을 유지하고, 끝난 뒤 다음 화면으로 넘어간다.
 */
export function RunScreen({ seed, debugEnemyHp }: { seed: number; debugEnemyHp: number | null }) {
  const { state, shown, busy, lastEvents, dispatch, restart } = useRunStore(seed, debugEnemyHp)
  const combatEvents = useMemo(() => lastEvents.filter(isCombatEvent), [lastEvents])
  const showCombat = state.combat !== null && (state.phase === 'combat' || busy)
  const newRun = () => restart(state.seed + 1)

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] overflow-hidden bg-surface-container-lowest" data-testid="run-screen">
      <RunTopBar state={shown} busy={busy} onNewRun={newRun} />
      {showCombat && state.combat ? (
        <CombatScreen
          key={`${state.floor}`}
          state={state.combat}
          busy={busy}
          lastEvents={combatEvents}
          dispatch={(action) => dispatch({ type: 'combat', action })}
        />
      ) : state.phase === 'shop' ? (
        <ShopScreen
          state={state}
          disabled={busy}
          onBuy={(index) => dispatch({ type: 'buy', index })}
          onLeave={() => dispatch({ type: 'leave' })}
        />
      ) : (
        <RunResult state={state} onNewRun={newRun} />
      )}
    </div>
  )
}
