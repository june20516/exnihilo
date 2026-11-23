import { useCallback, useRef, useState } from 'react'
import { BALANCE } from '@/game/content/balance'
import { weakenNewCombat } from '@/game/run/debug'
import { resolvesTurn } from '@/game/combat/events'
import { usePlaybackLock } from './usePlaybackLock'
import { isCombatEvent, reduceRun, type RunAction, type RunEvent, type RunState, startRun } from '@/game/run/run'

export interface RunStore {
  readonly state: RunState
  /** 화면에 보일 상태: 차례가 넘어가는 행동의 연출이 재생 중이면 행동 직전 상태, 끝나면 지금 상태. 결과가 연출보다 먼저 드러나지 않게 한다. */
  readonly shown: RunState
  readonly busy: boolean
  readonly lastEvents: readonly RunEvent[]
  dispatch(action: RunAction): void
  restart(seed: number): void
}

/**
 * 런 상태를 들고, 행동마다 엔진을 호출한 뒤 전투 이벤트를 연출 큐로 재생한다. 재생 중 입력은 무시한다.
 * debugEnemyHp가 있으면 새 전투마다 적 HP를 그 값으로 만든다(개발 전용, e2e용).
 * seed는 첫 렌더의 런에만 쓴다. 이후 새 런은 restart(seed)로 시작한다.
 */
export function useRunStore(seed: number, debugEnemyHp: number | null): RunStore {
  const { busy, isBusy, play } = usePlaybackLock()
  const applyDebugOverrides = useCallback(
    (before: RunState | null, after: RunState) => (debugEnemyHp === null ? after : weakenNewCombat(before, after, debugEnemyHp)),
    [debugEnemyHp],
  )
  const [state, setState] = useState(() => applyDebugOverrides(null, startRun(seed, BALANCE).state))
  const stateRef = useRef(state)
  const [shown, setShown] = useState(state)
  const [lastEvents, setLastEvents] = useState<readonly RunEvent[]>([])

  const dispatch = useCallback(
    (action: RunAction) => {
      if (isBusy()) return
      const before = stateRef.current
      const result = reduceRun(before, action, BALANCE)
      const next = applyDebugOverrides(before, result.state)
      stateRef.current = next
      setState(next)
      setLastEvents(result.events)
      const combatEvents = result.events.filter(isCombatEvent)
      if (combatEvents.length === 0) {
        setShown(next)
        return
      }
      // 차례가 넘어가는 행동이면 연출이 끝날 때까지 행동 직전 상태를 보인다(카드 놓기 등은 바로 보인다).
      setShown(resolvesTurn(combatEvents) ? before : next)
      play(combatEvents, () => setShown(stateRef.current))
    },
    [applyDebugOverrides, isBusy, play],
  )

  const restart = useCallback(
    (nextSeed: number) => {
      const next = applyDebugOverrides(null, startRun(nextSeed, BALANCE).state)
      stateRef.current = next
      setState(next)
      setShown(next)
      setLastEvents([])
    },
    [applyDebugOverrides],
  )

  return { state, shown, busy, lastEvents, dispatch, restart }
}
