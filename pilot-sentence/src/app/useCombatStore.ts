import { useCallback, useRef, useState } from 'react'
import { BALANCE } from '@/game/content/balance'
import type { WordId } from '@/game/content/words'
import { type CombatEvent, resolvesTurn } from '@/game/combat/events'
import { type RallyAction, type RallyState, reduceRally, startRally } from '@/game/rally/combat'
import { usePlaybackLock } from './usePlaybackLock'

export interface CombatStore {
  readonly state: RallyState
  /** 화면에 보일 상태: 차례가 넘어가는 행동의 연출이 재생 중이면 행동 직전 상태, 끝나면 지금 상태. */
  readonly shown: RallyState
  readonly busy: boolean
  readonly lastEvents: readonly CombatEvent[]
  dispatch(action: RallyAction): void
}

/**
 * 전투 상태를 들고, 행동마다 엔진을 호출한 뒤 이벤트를 연출 큐로 재생한다. 재생 중 입력은 무시한다.
 * 조우·덱·시드가 바뀌면 호출자가 key를 바꿔 새로 마운트한다.
 */
export function useCombatStore(encounterId: string, seed: number, deck: readonly WordId[]): CombatStore {
  const { busy, isBusy, play } = usePlaybackLock()
  const [state, setState] = useState(() => startRally(encounterId, deck, seed, BALANCE).state)
  const stateRef = useRef(state)
  const [shown, setShown] = useState(state)
  const [lastEvents, setLastEvents] = useState<readonly CombatEvent[]>([])

  const dispatch = useCallback(
    (action: RallyAction) => {
      if (isBusy()) return
      const before = stateRef.current
      const result = reduceRally(before, action, BALANCE)
      stateRef.current = result.state
      setState(result.state)
      setLastEvents(result.events)
      setShown(resolvesTurn(result.events) ? before : result.state)
      play(result.events, () => setShown(stateRef.current))
    },
    [isBusy, play],
  )

  return { state, shown, busy, lastEvents, dispatch }
}
