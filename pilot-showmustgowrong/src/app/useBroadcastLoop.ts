import { useCallback, useEffect, useRef, useState } from 'react'
import type { GaugeKind } from '@/content/types'
import type { AdEffect } from '@/sim/director'
import {
  Broadcast,
  ShowValidationError,
  type BroadcastInput,
  type BroadcastSetup,
  type BroadcastSummary,
  type BroadcastView,
  type ChainLine,
} from '@/sim/engine'
import { BroadcastLoop, type LoopSnapshot, type Slowmo } from './loopState'

export interface BroadcastResult {
  summary: BroadcastSummary
  longestChain: ChainLine[]
  haltedBy: GaugeKind | null
  interventionsIssued: number
}

export interface BroadcastLoopControls {
  view: BroadcastView | null
  /** Broadcast.create 실패나 루프 오류. 있으면 오류 화면을 띄운다(spec 9.6). */
  error: string | null
  /** 방송이 끝나면(완료 또는 중단) 채워진다. */
  result: BroadcastResult | null
  slowmo: Slowmo
  interventionOpen: boolean
  interventionSecondsLeft: number
  adPanelOpen: boolean
  adBreak: boolean
  adBreakSecondsLeft: number
  send(input: BroadcastInput): void
  openIntervention(): void
  closeIntervention(): void
  /** 광고 효과를 고르는 패널을 연다. */
  startAd(): void
  cancelAd(): void
  /** 고른 효과로 'ad' 입력을 보낸다(Ruling 4). */
  endAd(effects: AdEffect[]): void
}

const INITIAL_SNAPSHOT: LoopSnapshot = {
  slowmo: 'none',
  interventionOpen: false,
  interventionSecondsLeft: 0,
  interventionsIssued: 0,
  adPanelOpen: false,
  adBreak: false,
  adBreakSecondsLeft: 0,
  ended: false,
}

function errorMessage(error: unknown): string {
  if (error instanceof ShowValidationError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * 방송 한 회를 실시간으로 돌린다. requestAnimationFrame의 timestamp로 실제 경과 시간을 재고
 * 속도 규칙은 BroadcastLoop가 맡는다. setup이 바뀌면 새 방송을 만든다(호출 쪽에서 useMemo로 고정).
 */
export function useBroadcastLoop(setup: BroadcastSetup): BroadcastLoopControls {
  const loopRef = useRef<BroadcastLoop<BroadcastView> | null>(null)
  const [view, setView] = useState<BroadcastView | null>(null)
  const [snapshot, setSnapshot] = useState<LoopSnapshot>(INITIAL_SNAPSHOT)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BroadcastResult | null>(null)

  useEffect(() => {
    // StrictMode 이중 마운트: 먼저 만든 방송은 정리 뒤 도착하면 바로 해제한다.
    let disposed = false
    let broadcast: Broadcast | null = null
    let frameId = 0
    let lastTimestamp: number | null = null

    const publish = (loop: BroadcastLoop<BroadcastView>): void => {
      setView(loop.view)
      setSnapshot(loop.snapshot())
    }

    const onFrame = (timestamp: number): void => {
      const loop = loopRef.current
      if (disposed || loop === null || broadcast === null) return
      const seconds = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000
      lastTimestamp = timestamp
      try {
        loop.frame(seconds)
      } catch (frameError) {
        setError(errorMessage(frameError))
        return
      }
      publish(loop)
      const current = loop.snapshot()
      if (current.ended) {
        setResult({
          summary: broadcast.summary(),
          longestChain: broadcast.longestChain(),
          haltedBy: loop.view.haltedBy,
          interventionsIssued: current.interventionsIssued,
        })
        return
      }
      frameId = requestAnimationFrame(onFrame)
    }

    Broadcast.create(setup).then(
      (created) => {
        if (disposed) {
          created.dispose()
          return
        }
        broadcast = created
        const loop = new BroadcastLoop(created)
        loopRef.current = loop
        publish(loop)
        frameId = requestAnimationFrame(onFrame)
      },
      (createError: unknown) => {
        if (!disposed) setError(errorMessage(createError))
      },
    )

    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      loopRef.current = null
      broadcast?.dispose()
    }
  }, [setup])

  /** 루프 명령을 실행하고 상태를 바로 화면에 반영한다(다음 프레임을 기다리지 않는다). */
  const command = useCallback((action: (loop: BroadcastLoop<BroadcastView>) => void): void => {
    const loop = loopRef.current
    if (loop === null) return
    action(loop)
    setSnapshot(loop.snapshot())
  }, [])

  const send = useCallback(
    (input: BroadcastInput) => command((loop) => loop.send(input)),
    [command],
  )
  const openIntervention = useCallback(
    () => command((loop) => loop.openIntervention()),
    [command],
  )
  const closeIntervention = useCallback(
    () => command((loop) => loop.closeIntervention()),
    [command],
  )
  const startAd = useCallback(() => command((loop) => loop.openAdPanel()), [command])
  const cancelAd = useCallback(() => command((loop) => loop.cancelAdPanel()), [command])
  const endAd = useCallback(
    (effects: AdEffect[]) => command((loop) => loop.confirmAd(effects)),
    [command],
  )

  return {
    view,
    error,
    result,
    slowmo: snapshot.slowmo,
    interventionOpen: snapshot.interventionOpen,
    interventionSecondsLeft: snapshot.interventionSecondsLeft,
    adPanelOpen: snapshot.adPanelOpen,
    adBreak: snapshot.adBreak,
    adBreakSecondsLeft: snapshot.adBreakSecondsLeft,
    send,
    openIntervention,
    closeIntervention,
    startAd,
    cancelAd,
    endAd,
  }
}
