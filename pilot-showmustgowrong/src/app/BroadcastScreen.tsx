import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { INTERVENTION_REAL_SECONDS } from '@/content/balance'
import type { PerformerDef } from '@/content/types'
import { StudioRenderer } from '@/render/StudioRenderer'
import { clientToCanvas } from '@/render/geometry'
import type { BroadcastInput, BroadcastSetup } from '@/sim/engine'
import { AdPanel } from './AdPanel'
import { ErrorScreen } from './ErrorScreen'
import { CameraSwitcher, EventLog, GaugeMeters, ViewerBoard } from './Hud'
import { InterventionPanel } from './InterventionPanel'
import type { InterventionTarget } from './interventionTargets'
import { GAUGE_LABELS, SWITCHER_KEYS } from './labels'
import { ResultScreen } from './ResultScreen'
import { useBroadcastLoop } from './useBroadcastLoop'

interface BroadcastScreenProps {
  setup: BroadcastSetup
  onRestart(): void
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * 생방송 화면(1280×720 한 화면). 왼쪽 위에 스튜디오 캔버스를 960×540으로 줄여 두고,
 * 그 아래에 스위처와 사고 로그, 오른쪽 320px 열에 시청자 수·게이지·개입·광고를 둔다.
 */
export function BroadcastScreen({ setup, onRestart }: BroadcastScreenProps) {
  const loop = useBroadcastLoop(setup)
  const {
    view,
    slowmo,
    interventionOpen,
    adPanelOpen,
    adBreak,
    send,
    openIntervention,
    closeIntervention,
    startAd,
    cancelAd,
  } = loop
  const { show } = setup
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<StudioRenderer | null>(null)
  const [rendererError, setRendererError] = useState<string | null>(null)
  // 결과·오류 화면에서는 스튜디오가 없으므로 렌더러를 정리한다(다시 하기 때 새로 만든다).
  const studioVisible = loop.error === null && rendererError === null && loop.result === null
  const [selectedTarget, setSelectedTarget] = useState<InterventionTarget | null>(null)

  const performers = useMemo(
    () =>
      new Map<string, PerformerDef>(
        [...setup.performers, ...setup.bench].map((performer) => [performer.id, performer]),
      ),
    [setup],
  )

  // 렌더러 생명주기. StrictMode 이중 마운트에서는 AbortController로 앞의 생성을 취소한다.
  useEffect(() => {
    const host = hostRef.current
    if (!studioVisible || host === null) return
    const controller = new AbortController()
    let renderer: StudioRenderer | null = null
    StudioRenderer.create(host, show, controller.signal).then(
      (created) => {
        renderer = created
        rendererRef.current = created
      },
      (error: unknown) => {
        if (!isAbortError(error)) setRendererError(String(error))
      },
    )
    return () => {
      controller.abort()
      renderer?.destroy()
      rendererRef.current = null
    }
  }, [show, studioVisible])

  useEffect(() => {
    if (view !== null) rendererRef.current?.draw(view, slowmo !== 'none')
  }, [view, slowmo])

  const beginIntervention = useCallback(
    (target: InterventionTarget | null) => {
      setSelectedTarget(target)
      openIntervention()
    },
    [openIntervention],
  )

  // 키보드: 1·2·3 카메라, Space 개입 열기/닫기, Esc 패널 닫기.
  // 화면이 뜨자마자 누른 키도 놓치지 않도록 리스너는 마운트 때 한 번 붙이고 최신 상태는 effect event로 읽는다.
  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    if (event.repeat || view === null || view.phase === 'ended') return
    const cameraIndex = SWITCHER_KEYS.indexOf(event.key)
    if (cameraIndex >= 0) {
      const camera = show.cameras[cameraIndex]
      if (camera !== undefined) send({ type: 'switch', cameraId: camera.id })
      return
    }
    if (event.code === 'Space') {
      // 포커스된 버튼이 Space로 함께 눌리지 않게 한다.
      event.preventDefault()
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      if (interventionOpen) closeIntervention()
      else beginIntervention(null)
      return
    }
    if (event.key === 'Escape') {
      if (interventionOpen) closeIntervention()
      if (adPanelOpen) cancelAd()
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const onStudioClick = (event: MouseEvent<HTMLDivElement>): void => {
    const renderer = rendererRef.current
    const host = hostRef.current
    if (renderer === null || host === null) return
    const point = clientToCanvas(event.clientX, event.clientY, host.getBoundingClientRect())
    const actorId = renderer.actorAt(point.x, point.y)
    if (actorId !== null) beginIntervention({ kind: 'performer', id: actorId })
  }

  const onDirect = (input: BroadcastInput): void => {
    send(input)
    setSelectedTarget(null)
  }

  if (loop.error !== null) {
    return <ErrorScreen kind={loop.error.kind} message={loop.error.message} />
  }
  if (rendererError !== null) return <ErrorScreen kind="create" message={rendererError} />
  if (loop.result !== null) return <ResultScreen result={loop.result} onRestart={onRestart} />

  const highlightedEventId = slowmo === 'auto' ? (view?.autoSlowmo?.eventId ?? null) : null
  const highlightedGauge = slowmo === 'auto' ? (view?.autoSlowmo?.gauge ?? null) : null

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-white">
      <div className="flex w-[960px] shrink-0 flex-col gap-2">
        <div data-testid="studio" className="relative h-[540px] w-[960px] shrink-0">
          <div
            ref={hostRef}
            onClick={onStudioClick}
            className="studio-host h-full w-full cursor-pointer"
          />
          {view === null && (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
              스튜디오 준비 중…
            </div>
          )}
          {view !== null && slowmo !== 'none' && !adBreak && (
            <SlowmoBadge
              text={
                slowmo === 'intervention'
                  ? '개입 슬로모션'
                  : highlightedGauge !== null
                    ? `자동 슬로모션 · ${GAUGE_LABELS[highlightedGauge]} 게이지 위험`
                    : '자동 슬로모션 · 큰 사고'
              }
            />
          )}
          {adBreak && <CommercialBreak secondsLeft={loop.adBreakSecondsLeft} />}
        </div>
        {view !== null && (
          <div className="flex h-[172px] gap-2">
            <CameraSwitcher
              cameras={show.cameras}
              onAirCameraId={view.onAirCameraId}
              onSwitch={(cameraId) => send({ type: 'switch', cameraId })}
            />
            <EventLog log={view.log} highlightedEventId={highlightedEventId} />
          </div>
        )}
      </div>
      {view !== null && (
        <aside className="flex min-w-0 flex-1 flex-col gap-2 p-2">
          <ViewerBoard view={view} show={show} />
          <GaugeMeters view={view} highlighted={highlightedGauge} />
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="intervene-button"
              aria-pressed={interventionOpen}
              disabled={adBreak || adPanelOpen}
              onClick={() => (interventionOpen ? closeIntervention() : beginIntervention(null))}
              className="flex-1 rounded border-2 border-red-500 bg-red-700 px-2 py-2 font-bold hover:bg-red-600 disabled:opacity-40"
            >
              개입 <kbd className="text-xs font-normal">Space</kbd>
            </button>
            <button
              type="button"
              data-testid="ad-button"
              data-ads-left={view.adsLeft}
              disabled={view.adsLeft === 0 || adBreak || adPanelOpen}
              onClick={startAd}
              className="flex-1 rounded border-2 border-amber-400 bg-amber-600 px-2 py-2 font-bold text-neutral-950 hover:bg-amber-500 disabled:opacity-40"
            >
              광고 <span className="text-xs font-normal">남은 {view.adsLeft}회</span>
            </button>
          </div>
          {interventionOpen && (
            <InterventionPanel
              view={view}
              performers={performers}
              staff={setup.staff}
              selected={selectedTarget}
              secondsLeft={loop.interventionSecondsLeft}
              onSelect={setSelectedTarget}
              onDirect={onDirect}
              onClose={closeIntervention}
            />
          )}
          {adPanelOpen && (
            <AdPanel
              benchLeft={view.benchLeft}
              secondsLeft={loop.adPanelSecondsLeft}
              onConfirm={loop.endAd}
              onCancel={cancelAd}
            />
          )}
          {!interventionOpen && !adPanelOpen && (
            <p className="text-xs leading-5 text-neutral-400">
              출연자를 클릭하거나 Space를 누르면 시간이 느려지며 개입합니다({INTERVENTION_REAL_SECONDS}초). 지시가 쌓이면
              출연자가 덜 따르고, 내성을 넘기면 방송을 떠납니다.
              <br />
              누적 피로 {view.fatigue}
            </p>
          )}
          <p className="mt-auto text-right text-[11px] text-neutral-600">시드 {setup.seed}</p>
        </aside>
      )}
    </main>
  )
}

function SlowmoBadge({ text }: { text: string }) {
  return (
    <div
      data-testid="slowmo-badge"
      className="pointer-events-none absolute left-3 top-3 rounded bg-black/70 px-3 py-1 text-sm font-bold text-amber-300"
    >
      {text}
    </div>
  )
}

function CommercialBreak({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div
      data-testid="commercial-break"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950/90"
    >
      <div className="rotate-[-4deg] rounded border-4 border-amber-400 px-8 py-4 text-5xl font-black tracking-widest text-amber-300">
        COMMERCIAL BREAK
      </div>
      <div className="tabular-nums text-neutral-300">
        광고 중 · {Math.ceil(secondsLeft)}초 뒤 방송으로 돌아갑니다
      </div>
    </div>
  )
}
