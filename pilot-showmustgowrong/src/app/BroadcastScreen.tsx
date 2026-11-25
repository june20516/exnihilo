import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type Ref,
} from 'react'
import { INTERVENTION_SPEED } from '@/content/balance'
import type { PerformerDef } from '@/content/types'
import { StudioRenderer, type StudioHit, type StudioMode } from '@/render/StudioRenderer'
import { clientToCanvas } from '@/render/geometry'
import type { BroadcastInput, BroadcastSetup, BroadcastView } from '@/sim/engine'
import { AdPanel } from './AdPanel'
import { ErrorScreen } from './ErrorScreen'
import { HoverTip } from './HoverTip'
import { hoverTipContent, type HoverTipState } from './hoverTipContent'
import { EventLog, TopBand } from './Hud'
import { InterventionPanel } from './InterventionPanel'
import type { InterventionTarget } from './interventionTargets'
import { GAUGE_LABELS, SWITCHER_KEYS } from './labels'
import type { Slowmo } from './loopState'
import { OnAirColumn } from './OnAirColumn'
import { ResultScreen } from './ResultScreen'
import { useStudioClick, type StudioClickState } from './studioClick'
import { useBroadcastLoop, type BroadcastLoopControls } from './useBroadcastLoop'

interface BroadcastScreenProps {
  setup: BroadcastSetup
  onRestart(): void
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

const STUDIO_MODES: Record<Slowmo, StudioMode> = {
  none: 'live',
  intervention: 'intervention',
  auto: 'auto',
}

/** 판단 카드에서 선이 나가는 높이(카드 위에서, px) */
const LINK_CARD_OFFSET_Y = 24

/** 생방송 화면이 루프에서 쓰는 상태와 명령 */
export type StageControls = Omit<BroadcastLoopControls, 'view' | 'error' | 'result'>

/** 스튜디오 캔버스와 카드-대상 연결선을 위한 DOM 연결(정적 렌더 테스트에서는 없다) */
export interface StudioBindings {
  rowRef: Ref<HTMLDivElement>
  hostRef: Ref<HTMLDivElement>
  cardRef: Ref<HTMLElement>
  linkRef: Ref<SVGGElement>
  onClick(event: MouseEvent<HTMLDivElement>): void
  onMouseMove(event: MouseEvent<HTMLDivElement>): void
  onMouseLeave(): void
}

/**
 * 생방송 화면 컨테이너. 방송 루프, 스튜디오 렌더러(생성·크기·그리기), 키보드, 스튜디오 클릭과 호버,
 * 카드-대상 연결선을 맡고 배치는 BroadcastStage에 넘긴다.
 */
export function BroadcastScreen({ setup, onRestart }: BroadcastScreenProps) {
  const loop = useBroadcastLoop(setup)
  const { view, slowmo, interventionOpen, adPanelOpen, adBreak, send } = loop
  const { openIntervention, closeIntervention, cancelAd } = loop
  const { show } = setup
  const rowRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const linkRef = useRef<SVGGElement>(null)
  const rendererRef = useRef<StudioRenderer | null>(null)
  const [rendererError, setRendererError] = useState<string | null>(null)
  // 결과·오류 화면에서는 스튜디오가 없으므로 렌더러를 정리한다(다시 하기 때 새로 만든다).
  const studioVisible = loop.error === null && rendererError === null && loop.result === null
  const [selectedTarget, setSelectedTarget] = useState<InterventionTarget | null>(null)
  const [hoverTip, setHoverTip] = useState<HoverTipState | null>(null)

  // 렌더러 생명주기. StrictMode 이중 마운트에서는 AbortController로 앞의 생성을 취소한다.
  // 스튜디오 영역 크기가 바뀌면 캔버스를 그 크기로 맞춘다(fitIso로 꽉 채움).
  useEffect(() => {
    const host = hostRef.current
    if (!studioVisible || host === null) return
    const controller = new AbortController()
    let renderer: StudioRenderer | null = null
    const observer = new ResizeObserver(() => {
      renderer?.resize(host.clientWidth, host.clientHeight)
    })
    StudioRenderer.create(host, show, controller.signal).then(
      (created) => {
        renderer = created
        rendererRef.current = created
        created.resize(host.clientWidth, host.clientHeight)
        observer.observe(host)
      },
      (error: unknown) => {
        if (!isAbortError(error)) setRendererError(String(error))
      },
    )
    return () => {
      controller.abort()
      observer.disconnect()
      renderer?.destroy()
      rendererRef.current = null
    }
  }, [show, studioVisible])

  /** 판단 카드 오른쪽 위에서 스튜디오의 대상까지 선을 긋는다. 대상이 없으면 숨긴다. */
  const updateLink = useCallback((target: InterventionTarget | null): void => {
    const link = linkRef.current
    if (link === null) return
    const renderer = rendererRef.current
    const row = rowRef.current
    const host = hostRef.current
    const card = cardRef.current
    const anchor =
      target === null || renderer === null
        ? null
        : renderer.anchorOf(target.kind === 'performer' ? 'actor' : 'staff', target.id)
    if (anchor === null || renderer === null || row === null || host === null || card === null) {
      link.setAttribute('visibility', 'hidden')
      return
    }
    const rowRect = row.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const scaleX = hostRect.width / renderer.size.width
    const scaleY = hostRect.height / renderer.size.height
    const line = link.querySelector('line')
    const dot = link.querySelector('circle')
    const toX = hostRect.left - rowRect.left + anchor.x * scaleX
    const toY = hostRect.top - rowRect.top + anchor.y * scaleY
    line?.setAttribute('x1', String(cardRect.right - rowRect.left))
    line?.setAttribute('y1', String(cardRect.top - rowRect.top + LINK_CARD_OFFSET_Y))
    line?.setAttribute('x2', String(toX))
    line?.setAttribute('y2', String(toY))
    dot?.setAttribute('cx', String(toX))
    dot?.setAttribute('cy', String(toY))
    link.setAttribute('visibility', 'visible')
  }, [])

  const linkedTarget = interventionOpen ? selectedTarget : null
  useEffect(() => {
    if (view === null) return
    rendererRef.current?.draw(view, STUDIO_MODES[slowmo])
    updateLink(linkedTarget)
  }, [view, slowmo, linkedTarget, updateLink])

  const beginIntervention = useCallback(() => {
    setSelectedTarget(null)
    setHoverTip(null)
    openIntervention()
  }, [openIntervention])

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
      else beginIntervention()
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

  const actors = view?.actors
  const activeActorIds = useMemo(
    () =>
      new Set(
        (actors ?? [])
          .filter((actor) => !actor.walkedOut && !actor.departed)
          .map((actor) => actor.id),
      ),
    [actors],
  )
  const viewPhase = view?.phase ?? 'live'
  const clickState = useMemo<StudioClickState>(
    () => ({
      phase: viewPhase === 'ended' ? 'ended' : adBreak || viewPhase === 'adBreak' ? 'ad' : 'live',
      interventionOpen,
      activeActorIds,
      trackingCameraId: show.cameras.find((camera) => camera.tracking === true)?.id ?? null,
    }),
    [viewPhase, adBreak, interventionOpen, activeActorIds, show],
  )
  const selectFromStudio = useCallback(
    (hit: Extract<StudioHit, { kind: 'actor' | 'staff' }>) =>
      setSelectedTarget({ kind: hit.kind === 'actor' ? 'performer' : 'staff', id: hit.id }),
    [],
  )
  const clickStudio = useStudioClick(clickState, { send, selectTarget: selectFromStudio })

  /** 스튜디오 위 마우스 위치의 대상과, 스튜디오 영역 안의 CSS 좌표 */
  const studioHitAt = (event: MouseEvent<HTMLDivElement>) => {
    const renderer = rendererRef.current
    const host = hostRef.current
    if (renderer === null || host === null) return null
    const rect = host.getBoundingClientRect()
    const point = clientToCanvas(event.clientX, event.clientY, rect, renderer.size)
    return {
      hit: renderer.hitTest(point.x, point.y),
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const studio: StudioBindings = {
    rowRef,
    hostRef,
    cardRef,
    linkRef,
    onClick: (event) => {
      const found = studioHitAt(event)
      if (found !== null) clickStudio(found.hit)
    },
    onMouseMove: (event) => {
      const found = studioHitAt(event)
      // 호버 설명은 개입 밖에서만(개입 중에는 판단 카드가 주인공이다).
      const content =
        found === null || view === null || interventionOpen
          ? null
          : hoverTipContent(found.hit, view, setup.equipment)
      const tip = content === null || found === null ? null : { ...content, x: found.x, y: found.y }
      setHoverTip(tip)
    },
    onMouseLeave: () => setHoverTip(null),
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

  return (
    <BroadcastStage
      view={view}
      setup={setup}
      controls={loop}
      selectedTarget={selectedTarget}
      hoverTip={interventionOpen ? null : hoverTip}
      onSelectTarget={setSelectedTarget}
      onDirect={onDirect}
      onBeginIntervention={beginIntervention}
      studio={studio}
    />
  )
}

export interface BroadcastStageProps {
  /** 방송이 아직 만들어지지 않았으면 null(스튜디오만 "준비 중") */
  view: BroadcastView | null
  setup: BroadcastSetup
  controls: StageControls
  selectedTarget: InterventionTarget | null
  hoverTip: HoverTipState | null
  onSelectTarget(target: InterventionTarget): void
  onDirect(input: BroadcastInput): void
  onBeginIntervention(): void
  studio?: StudioBindings
}

/**
 * 생방송 화면 배치(1280×720, spec 8.2). 위 띠 96px(게이지 | 시청자·시간 | 코너), 아래 줄은
 * 왼쪽 260px(사고 로그, 개입 중에는 판단 카드) | 가운데 스튜디오 | 오른쪽 300px(ON AIR 모니터,
 * 미리보기 2개, 개입·광고 버튼). 스튜디오 캔버스는 렌더러가 붙이므로 여기서는 자리만 둔다.
 */
export function BroadcastStage({
  view,
  setup,
  controls,
  selectedTarget,
  hoverTip,
  onSelectTarget,
  onDirect,
  onBeginIntervention,
  studio,
}: BroadcastStageProps) {
  const { show } = setup
  const { slowmo, interventionOpen, adPanelOpen, adBreak } = controls
  const performers = useMemo(
    () =>
      new Map<string, PerformerDef>(
        [...setup.performers, ...setup.bench].map((performer) => [performer.id, performer]),
      ),
    [setup],
  )
  const highlightedEventId = slowmo === 'auto' ? (view?.autoSlowmo?.eventId ?? null) : null
  const alertGauge = slowmo === 'auto' ? (view?.autoSlowmo?.gauge ?? null) : null

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b1120] text-white">
      {view !== null ? (
        <TopBand view={view} show={show} alertGauge={alertGauge} />
      ) : (
        <div className="h-[96px] shrink-0" />
      )}
      <div ref={studio?.rowRef} className="relative flex min-h-0 flex-1 gap-2 pb-3">
        <div className="flex w-[260px] shrink-0 flex-col gap-2 py-1 pl-3">
          {view !== null &&
            (interventionOpen ? (
              <InterventionPanel
                view={view}
                performers={performers}
                staff={setup.staff}
                selected={selectedTarget}
                onSelect={onSelectTarget}
                onDirect={onDirect}
                onClose={controls.closeIntervention}
                cardRef={studio?.cardRef}
              />
            ) : (
              <>
                <EventLog log={view.log} highlightedEventId={highlightedEventId} />
                <p className="text-[11px] text-slate-500">
                  누적 피로 {view.fatigue} · 시드 {setup.seed}
                </p>
              </>
            ))}
        </div>
        <div
          data-testid="studio"
          className="relative min-w-0 flex-1 overflow-hidden rounded-xl border-2 border-slate-800 bg-[#14141c]"
        >
          <div
            ref={studio?.hostRef}
            onClick={studio?.onClick}
            onMouseMove={studio?.onMouseMove}
            onMouseLeave={studio?.onMouseLeave}
            className="studio-host absolute inset-0 cursor-pointer"
          />
          {view === null && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              스튜디오 준비 중…
            </div>
          )}
          {view !== null && slowmo === 'intervention' && !adBreak && (
            <InterventionBadge
              secondsLeft={
                adPanelOpen ? (controls.adPanelSecondsLeft ?? 0) : controls.interventionSecondsLeft
              }
            />
          )}
          {view !== null && slowmo === 'auto' && !adBreak && (
            <AutoSlowmoBadge
              text={
                alertGauge !== null
                  ? `자동 슬로모션 · ${GAUGE_LABELS[alertGauge]} 게이지 위험`
                  : '자동 슬로모션 · 큰 사고'
              }
            />
          )}
          {adBreak && <CommercialBreak secondsLeft={controls.adBreakSecondsLeft} />}
          {hoverTip !== null && <HoverTip tip={hoverTip} />}
        </div>
        {view !== null && (
          <OnAirColumn
            view={view}
            show={show}
            performers={performers}
            onSwitch={(cameraId) => controls.send({ type: 'switch', cameraId })}
            actions={
              <BroadcastButtons
                view={view}
                controls={controls}
                onBeginIntervention={onBeginIntervention}
              />
            }
            overlay={
              adPanelOpen && (
                <div className="absolute inset-x-0 top-1 z-10 pr-3">
                  <AdPanel
                    benchLeft={view.benchLeft}
                    secondsLeft={controls.adPanelSecondsLeft}
                    onConfirm={controls.endAd}
                    onCancel={controls.cancelAd}
                  />
                </div>
              )
            }
          />
        )}
        {/* 판단 카드와 스튜디오의 대상을 잇는 선. 좌표는 컨테이너가 매 프레임 직접 고친다. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <g ref={studio?.linkRef} visibility="hidden">
            <line stroke="#fcd34d" strokeWidth={2} strokeDasharray="6 4" />
            <circle r={7} fill="none" stroke="#fcd34d" strokeWidth={2} />
          </g>
        </svg>
      </div>
    </main>
  )
}

interface BroadcastButtonsProps {
  view: BroadcastView
  controls: StageControls
  onBeginIntervention(): void
}

function BroadcastButtons({ view, controls, onBeginIntervention }: BroadcastButtonsProps) {
  const { interventionOpen, adBreak, adPanelOpen } = controls
  return (
    <div className="flex gap-2">
      <button
        type="button"
        data-testid="intervene-button"
        aria-pressed={interventionOpen}
        disabled={adBreak || adPanelOpen}
        onClick={() => (interventionOpen ? controls.closeIntervention() : onBeginIntervention())}
        className="flex h-16 flex-1 flex-col items-center justify-center rounded-xl border-2 border-red-300 bg-red-600 font-black shadow-[0_4px_0_#7f1d1d] hover:bg-red-500 active:translate-y-1 active:shadow-none disabled:opacity-40"
      >
        <span className="text-lg">{interventionOpen ? '개입 닫기' : '개입'}</span>
        <kbd className="text-[11px] font-normal opacity-80">Space</kbd>
      </button>
      <button
        type="button"
        data-testid="ad-button"
        data-ads-left={view.adsLeft}
        disabled={view.adsLeft === 0 || adBreak || adPanelOpen}
        onClick={controls.startAd}
        className="flex h-16 flex-1 flex-col items-center justify-center rounded-xl border-2 border-amber-200 bg-amber-400 font-black text-slate-950 shadow-[0_4px_0_#92400e] hover:bg-amber-300 active:translate-y-1 active:shadow-none disabled:opacity-40"
      >
        <span className="text-lg">광고</span>
        <span className="text-[11px] font-bold">남은 {view.adsLeft}회</span>
      </button>
    </div>
  )
}

/** 개입 중 스튜디오 위: 느려진 배율과 남은 선택 시간을 크게(spec 8.2) */
function InterventionBadge({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div
      data-testid="slowmo-badge"
      className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-full border-[3px] border-amber-300 bg-slate-950/85 py-1 pl-1.5 pr-5"
    >
      <span className="rounded-full bg-red-600 px-3 py-1 text-lg font-black">
        SLOW ×1/{Math.round(1 / INTERVENTION_SPEED)}
      </span>
      <span
        data-testid="intervention-seconds"
        className="text-3xl font-black tabular-nums text-amber-300"
      >
        {secondsLeft.toFixed(1)}초
      </span>
      <span className="text-xs text-slate-300">안에 지시</span>
    </div>
  )
}

function AutoSlowmoBadge({ text }: { text: string }) {
  return (
    <div
      data-testid="slowmo-badge"
      className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border-2 border-red-400 bg-slate-950/85 px-4 py-1 text-sm font-bold text-red-200"
    >
      {text}
    </div>
  )
}

function CommercialBreak({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div
      data-testid="commercial-break"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90"
    >
      <div className="rotate-[-4deg] rounded border-4 border-amber-400 px-8 py-4 text-5xl font-black tracking-widest text-amber-300">
        COMMERCIAL BREAK
      </div>
      <div className="tabular-nums text-slate-300">
        광고 중 · {Math.ceil(secondsLeft)}초 뒤 방송으로 돌아갑니다
      </div>
    </div>
  )
}
