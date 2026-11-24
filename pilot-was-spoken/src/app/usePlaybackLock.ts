import { useCallback, useRef, useState } from 'react'
import { createEffectPlayer } from '@/kit/fx/effectPlayer'
import type { CombatEvent } from '@/game/combat/events'
import { fxRegistry } from '@/game/fx/registry'

export interface PlaybackLock {
  /** 연출 재생 중(화면 표시용). */
  readonly busy: boolean
  /** 연출 재생 중(입력 처리용, 렌더를 기다리지 않는 최신 값). */
  isBusy(): boolean
  /** 이벤트를 연출 큐로 재생하고, 끝나면 잠금을 풀고 onDone을 부른다. */
  play(events: readonly CombatEvent[], onDone?: () => void): void
}

/** 전투 연출 재생과 재생 중 입력 잠금. 전투 store와 런 store가 함께 쓴다. */
export function usePlaybackLock(): PlaybackLock {
  const playerRef = useRef<ReturnType<typeof createEffectPlayer<CombatEvent>> | null>(null)
  playerRef.current ??= createEffectPlayer<CombatEvent>(fxRegistry, { speed: 1 })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const isBusy = useCallback(() => busyRef.current, [])
  const play = useCallback((events: readonly CombatEvent[], onDone?: () => void) => {
    busyRef.current = true
    setBusy(true)
    void playerRef.current?.play(events).finally(() => {
      busyRef.current = false
      setBusy(false)
      onDone?.()
    })
  }, [])

  return { busy, isBusy, play }
}
