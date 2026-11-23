import { useCallback, useRef, useState } from 'react'
import { createEffectPlayer } from '@/kit/fx/effectPlayer'
import { BALANCE } from '@/game/content/balance'
import { STARTER_DECK } from '@/game/content/encounters'
import { type CombatAction, type CombatState, reduceCombat, startCombat } from '@/game/combat/combat'
import type { CombatEvent } from '@/game/combat/events'
import { fxRegistry } from '@/game/fx/registry'

export interface CombatStore {
  readonly state: CombatState
  readonly busy: boolean
  readonly seed: number
  readonly lastEvents: readonly CombatEvent[]
  dispatch(action: CombatAction): void
  restart(seed?: number): void
}

/** 전투 상태를 들고, 행동마다 엔진을 호출한 뒤 이벤트를 연출 큐로 재생한다. 재생 중 입력은 무시한다. */
export function useCombatStore(encounterId: string, initialSeed: number): CombatStore {
  const playerRef = useRef(createEffectPlayer<CombatEvent>(fxRegistry, { speed: 1 }))
  const [seed, setSeed] = useState(initialSeed)
  const [state, setState] = useState(() => startCombat(encounterId, STARTER_DECK, initialSeed, BALANCE).state)
  const stateRef = useRef(state)
  const [busy, setBusy] = useState(false)
  const [lastEvents, setLastEvents] = useState<readonly CombatEvent[]>([])
  const busyRef = useRef(false)

  const playEvents = useCallback(async (events: readonly CombatEvent[]) => {
    busyRef.current = true
    setBusy(true)
    try {
      await playerRef.current.play(events)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const dispatch = useCallback(
    (action: CombatAction) => {
      if (busyRef.current) return
      const result = reduceCombat(stateRef.current, action, BALANCE)
      stateRef.current = result.state
      setState(result.state)
      setLastEvents(result.events)
      void playEvents(result.events)
    },
    [playEvents],
  )

  const restart = useCallback(
    (nextSeed?: number) => {
      if (busyRef.current) return
      const newSeed = nextSeed ?? seed + 1
      const result = startCombat(encounterId, STARTER_DECK, newSeed, BALANCE)
      setSeed(newSeed)
      stateRef.current = result.state
      setState(result.state)
      setLastEvents(result.events)
    },
    [encounterId, seed],
  )

  return { state, busy, seed, lastEvents, dispatch, restart }
}
