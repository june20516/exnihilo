import { useCallback, useMemo, useState } from 'react'
import { isCombatEvent } from '@/game/run/run'
import { CombatScreen } from '@/game/ui/CombatScreen'
import { HowToPlay } from '@/game/ui/HowToPlay'
import { hasSeenHowToPlay, markHowToPlaySeen } from '@/game/ui/howToPlaySteps'
import { RunResult } from '@/game/ui/RunResult'
import { RunTopBar } from '@/game/ui/RunTopBar'
import { ShopScreen } from '@/game/ui/ShopScreen'
import { useRunStore } from './useRunStore'

/**
 * 런 화면: 전투 → 상점 → … → 결과. 연출이 재생 중이면 전투 화면을 유지하고, 끝난 뒤 다음 화면으로 넘어간다.
 */
export function RunScreen({ seed, debugEnemyHp }: { seed: number; debugEnemyHp: number | null }) {
  const { shown, busy, lastEvents, dispatch, restart } = useRunStore(seed, debugEnemyHp)
  const combatEvents = useMemo(() => lastEvents.filter(isCombatEvent), [lastEvents])
  // 연출 중에는 shown이 행동 직전 상태라, 마지막 낭독의 연출이 끝날 때까지 전투 화면이 남는다.
  const showCombat = shown.phase === 'combat' && shown.combat !== null
  const newRun = () => restart(shown.seed + 1)
  // 처음 온 사람에게만 조작 안내를 띄운다. 닫으면 기억하고, 위쪽 "?" 버튼으로 다시 연다.
  const [howToOpen, setHowToOpen] = useState(() => !hasSeenHowToPlay(window.localStorage))
  const closeHowTo = useCallback(() => {
    markHowToPlaySeen(window.localStorage)
    setHowToOpen(false)
  }, [])

  return (
    <div className="relative grid h-full grid-rows-[auto_1fr] overflow-hidden bg-surface-container-lowest" data-testid="run-screen">
      <RunTopBar state={shown} busy={busy} onNewRun={newRun} onHowToPlay={() => setHowToOpen(true)} />
      {showCombat && shown.combat ? (
        <CombatScreen
          key={`${shown.seed}:${shown.floor}`}
          state={shown.combat}
          busy={busy}
          lastEvents={combatEvents}
          dispatch={(action) => dispatch({ type: 'combat', action })}
        />
      ) : shown.phase === 'shop' ? (
        <ShopScreen
          state={shown}
          disabled={busy}
          onBuy={(index) => dispatch({ type: 'buy', index })}
          onLeave={() => dispatch({ type: 'leave' })}
          onReroll={() => dispatch({ type: 'reroll' })}
        />
      ) : (
        <RunResult state={shown} onNewRun={newRun} />
      )}
      {howToOpen && <HowToPlay onClose={closeHowTo} />}
    </div>
  )
}
