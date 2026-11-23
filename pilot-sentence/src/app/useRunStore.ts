import { useCallback, useRef, useState } from 'react'
import { createEffectPlayer } from '@/kit/fx/effectPlayer'
import { BALANCE } from '@/game/content/balance'
import type { CombatEvent } from '@/game/combat/events'
import { fxRegistry } from '@/game/fx/registry'
import { weakenNewCombat } from '@/game/run/debug'
import { isCombatEvent, reduceRun, type RunAction, type RunEvent, type RunState, startRun } from '@/game/run/run'

export interface RunStore {
  readonly state: RunState
  /** 화면 요약(상단 바)에 보일 상태: 연출이 재생 중이면 행동 직전 상태, 끝나면 지금 상태. 정산 결과가 연출보다 먼저 드러나지 않게 한다. */
  readonly shown: RunState
  readonly busy: boolean
  readonly lastEvents: readonly RunEvent[]
  dispatch(action: RunAction): void
  restart(seed: number): void
}

/**
 * 런 상태를 들고, 행동마다 엔진을 호출한 뒤 전투 이벤트를 연출 큐로 재생한다. 재생 중 입력은 무시한다.
 * debugEnemyHp가 있으면 새 전투마다 적 HP를 그 값으로 만든다(개발 전용, e2e용).
 */
export function useRunStore(seed: number, debugEnemyHp: number | null): RunStore {
  const playerRef = useRef<ReturnType<typeof createEffectPlayer<CombatEvent>> | null>(null)
  playerRef.current ??= createEffectPlayer<CombatEvent>(fxRegistry, { speed: 1 })
  const debug = useCallback(
    (before: RunState | null, after: RunState) => (debugEnemyHp === null ? after : weakenNewCombat(before, after, debugEnemyHp)),
    [debugEnemyHp],
  )
  const [state, setState] = useState(() => debug(null, startRun(seed, BALANCE).state))
  const stateRef = useRef(state)
  const [shown, setShown] = useState(state)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [lastEvents, setLastEvents] = useState<readonly RunEvent[]>([])

  const dispatch = useCallback(
    (action: RunAction) => {
      if (busyRef.current) return
      const before = stateRef.current
      const result = reduceRun(before, action, BALANCE)
      const next = debug(before, result.state)
      stateRef.current = next
      setState(next)
      setLastEvents(result.events)
      const combatEvents = result.events.filter(isCombatEvent)
      if (combatEvents.length === 0) {
        setShown(next)
        return
      }
      setShown(before)
      busyRef.current = true
      setBusy(true)
      void playerRef.current?.play(combatEvents).finally(() => {
        busyRef.current = false
        setBusy(false)
        setShown(stateRef.current)
      })
    },
    [debug],
  )

  const restart = useCallback(
    (nextSeed: number) => {
      const next = debug(null, startRun(nextSeed, BALANCE).state)
      stateRef.current = next
      setState(next)
      setShown(next)
      setLastEvents([])
    },
    [debug],
  )

  return { state, shown, busy, lastEvents, dispatch, restart }
}
