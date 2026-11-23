import { useCallback, useRef, useState } from 'react'
import { createEffectPlayer } from '@/kit/fx/effectPlayer'
import { BALANCE } from '@/game/content/balance'
import type { RuleConfig } from '@/game/content/rules'
import type { WordId } from '@/game/content/words'
import { type CombatAction, type CombatState, reduceCombat, startCombat } from '@/game/combat/combat'
import type { CombatEvent } from '@/game/combat/events'
import { fxRegistry } from '@/game/fx/registry'

export interface CombatStore {
  readonly state: CombatState
  readonly busy: boolean
  readonly lastEvents: readonly CombatEvent[]
  dispatch(action: CombatAction): void
}

/**
 * 전투 상태를 들고, 행동마다 엔진을 호출한 뒤 이벤트를 연출 큐로 재생한다. 재생 중 입력은 무시한다.
 * 프리셋·조우·덱·시드가 바뀌면 호출자가 key를 바꿔 새로 마운트한다.
 */
export function useCombatStore(encounterId: string, seed: number, rules: RuleConfig, deck: readonly WordId[]): CombatStore {
  const playerRef = useRef<ReturnType<typeof createEffectPlayer<CombatEvent>> | null>(null)
  playerRef.current ??= createEffectPlayer<CombatEvent>(fxRegistry, { speed: 1 })
  const [state, setState] = useState(() => startCombat(encounterId, deck, seed, BALANCE, rules).state)
  const stateRef = useRef(state)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [lastEvents, setLastEvents] = useState<readonly CombatEvent[]>([])

  const dispatch = useCallback((action: CombatAction) => {
    if (busyRef.current) return
    const result = reduceCombat(stateRef.current, action, BALANCE)
    stateRef.current = result.state
    setState(result.state)
    setLastEvents(result.events)
    busyRef.current = true
    setBusy(true)
    void playerRef.current?.play(result.events).finally(() => {
      busyRef.current = false
      setBusy(false)
    })
  }, [])

  return { state, busy, lastEvents, dispatch }
}
