import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { isTextEntry } from '@/kit/tuning'
import { StudioRenderer, type StudioHit, type StudioMode } from '@/render/StudioRenderer'
import { clientToCanvas } from '@/render/geometry'
import type { BroadcastInput, BroadcastSetup, BroadcastView } from '@/sim/engine'
import { BroadcastStage, type StudioBindings } from './BroadcastStage'
import { ErrorScreen } from './ErrorScreen'
import type { ActorCardAnchor } from './ActorCardLayer'
import type { BodyBox } from './cardPlacement'
import { resolveHoverTip, type HoverAnchor, type HoverTipState } from './hoverTipContent'
import type { InterventionTarget } from './interventionTargets'
import { SWITCHER_KEYS } from './labels'
import type { Slowmo } from './loopState'
import { TrendRecorder } from './trendRecorder'
import { ResultScreen } from './ResultScreen'
import { focusedActorId, liveSelectedTarget, useStudioFocus } from './studioFocus'
import { useStudioClick, type StudioClickState } from './studioClick'
import { useAimDrag } from './useAimDrag'
import { useBroadcastLoop } from './useBroadcastLoop'
import { livePinnedAnchor } from './pinnedCard'
import { usePinnedDismiss } from './usePinnedDismiss'

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

/**
 * 생방송 화면 컨테이너. 방송 루프, 스튜디오 렌더러(생성·크기·그리기), 키보드, 스튜디오 클릭과 호버,
 * 카드-대상 연결선을 맡고 배치는 BroadcastStage에 넘긴다.
 */
export function BroadcastScreen({ setup, onRestart }: BroadcastScreenProps) {
  const loop = useBroadcastLoop(setup)
  const { view, slowmo, interventionOpen, adPanelOpen, adBreak, send } = loop
  const { openIntervention, closeIntervention, cancelAd } = loop
  // 렌더러 effect는 출연자 배열에만 기대고 setup 객체 전체에는 기대지 않는다. 배열은 라인업 상수를 그대로
  // 가리켜 방송 중에 바뀌지 않으므로 렌더러와 캔버스가 다시 만들어지지 않는다.
  const { show, performers, bench } = setup
  // 근접도 기록은 방송(이 컴포넌트가 마운트된 동안)마다 하나다. 배치를 바꿔도 다시 만들지 않는다.
  const [trend] = useState(
    () => new TrendRecorder([...performers, ...bench].map((performer) => performer.id)),
  )
  const rowRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const linkRef = useRef<SVGGElement>(null)
  const rendererRef = useRef<StudioRenderer | null>(null)
  const [rendererError, setRendererError] = useState<string | null>(null)
  // 결과·오류 화면에서는 스튜디오가 없으므로 렌더러를 정리한다(다시 하기 때 새로 만든다).
  const studioVisible = loop.error === null && rendererError === null && loop.result === null
  const [selectedTarget, setSelectedTarget] = useState<InterventionTarget | null>(null)
  /** 호버 설명의 대상과 자리. 내용은 렌더마다 지금 view로 다시 구한다(resolveHoverTip). */
  const [hoverAnchor, setHoverAnchor] = useState<HoverAnchor | null>(null)
  /** 지금 호버 설명을 띄운 대상("kind:id"). 같은 대상 위의 mousemove는 건너뛴다. */
  const hoverKeyRef = useRef<string | null>(null)
  /** 출연자·스태프를 클릭해 고정한 정보 설명. 있으면 호버 설명 대신 보인다. */
  const [pinnedAnchor, setPinnedAnchor] = useState<HoverAnchor | null>(null)
  /** 마지막 클릭 자리(스튜디오 CSS 좌표). 고정 설명을 그 자리에 띄운다. */
  const lastClickRef = useRef<{ x: number; y: number; body?: BodyBox }>({ x: 0, y: 0 })

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
    StudioRenderer.create(host, show, [...performers, ...bench], controller.signal).then(
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
  }, [show, performers, bench, studioVisible])

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

  /**
   * 출연자 몸 중심의 화면 좌표(스튜디오 영역 기준 CSS px)를 host의 data-actor-anchors에 JSON으로 싣는다.
   * e2e가 투영 좌표를 하드코딩하지 않고 읽어 클릭할 수 있게 하는 공개 표면이다(몸 상자 반 크기는 data-actor-half-sizes).
   */
  const publishActorAnchors = useCallback((current: BroadcastView): void => {
    const renderer = rendererRef.current
    const host = hostRef.current
    if (renderer === null || host === null) return
    const scaleX = host.clientWidth / renderer.size.width
    const scaleY = host.clientHeight / renderer.size.height
    const anchors: Record<string, [number, number]> = {}
    const halfSizes: Record<string, [number, number]> = {}
    for (const actor of current.actors) {
      const point = renderer.anchorOf('actor', actor.id)
      if (point !== null) anchors[actor.id] = [point.x * scaleX, point.y * scaleY]
      const half = renderer.actorHalfSize(actor.id)
      if (half !== null) halfSizes[actor.id] = [half.halfWidth * scaleX, half.halfHeight * scaleY]
    }
    host.dataset.actorAnchors = JSON.stringify(anchors)
    host.dataset.actorHalfSizes = JSON.stringify(halfSizes)
    const cameraAnchors: Record<string, [number, number]> = {}
    for (const camera of show.cameras) {
      const point = renderer.cameraAnchor(camera.id)
      if (point !== null) cameraAnchors[camera.id] = [point.x * scaleX, point.y * scaleY]
    }
    host.dataset.cameraAnchors = JSON.stringify(cameraAnchors)
  }, [show])

  // 몸 0.5초마다 한 점만 찍으므로 프레임마다 불러도 같은 구간에서는 건너뛴다
  useEffect(() => {
    if (view !== null) trend.record(view)
  }, [view, trend])

  // 고른 출연자가 개입 중 이탈하면 선택은 없는 것으로 친다(상태는 다음 개입 시작 때 비운다)
  const liveTarget = liveSelectedTarget(selectedTarget, view?.actors)
  const linkedTarget = interventionOpen ? liveTarget : null
  useEffect(() => {
    if (view === null) return
    rendererRef.current?.draw(view, STUDIO_MODES[slowmo])
    updateLink(linkedTarget)
    publishActorAnchors(view)
  }, [view, slowmo, linkedTarget, updateLink, publishActorAnchors])

  // 개입 중 고른 출연자만 스튜디오에서 밝게 남긴다
  useStudioFocus(rendererRef, focusedActorId(interventionOpen, liveTarget))

  const beginIntervention = useCallback(() => {
    setSelectedTarget(null)
    hoverKeyRef.current = null
    setHoverAnchor(null)
    setPinnedAnchor(null)
    openIntervention()
  }, [openIntervention])

  // 키보드: 1·2·3 카메라, Space 개입 열기/닫기, Esc 패널 닫기.
  // 화면이 뜨자마자 누른 키도 놓치지 않도록 리스너는 마운트 때 한 번 붙이고 최신 상태는 effect event로 읽는다.
  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    if (event.repeat || view === null || view.phase === 'ended') return
    // 조정 패널의 입력 칸에 치는 숫자·Space가 카메라 전환과 개입으로 새지 않게 한다
    if (isTextEntry(event.target)) return
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
    }),
    [viewPhase, adBreak, interventionOpen, activeActorIds],
  )
  const selectFromStudio = useCallback(
    (hit: Extract<StudioHit, { kind: 'actor' | 'staff' }>) =>
      setSelectedTarget({ kind: hit.kind === 'actor' ? 'performer' : 'staff', id: hit.id }),
    [],
  )
  const showInfo = useCallback((hit: Extract<StudioHit, { kind: 'actor' | 'staff' }>) => {
    hoverKeyRef.current = null
    setHoverAnchor(null)
    setPinnedAnchor({ hit, ...lastClickRef.current })
  }, [])
  const clearInfo = useCallback(() => setPinnedAnchor(null), [])
  const clickStudio = useStudioClick(clickState, {
    selectTarget: selectFromStudio,
    showInfo,
    clearInfo,
  })
  const trackingCameraIds = useMemo(
    () => new Set(show.cameras.filter((camera) => camera.tracking === true).map((c) => c.id)),
    [show],
  )
  const aimDrag = useAimDrag({
    rendererRef,
    hostRef,
    view,
    clickState,
    send,
    onDragStart: () => {
      hoverKeyRef.current = null
      setHoverAnchor(null)
      setPinnedAnchor(null)
    },
  })
  /** 캔버스 좌표 아래의 추적 카메라 표시 id. 없으면 null */
  const trackingCameraAt = (x: number, y: number): string | null => {
    const id = rendererRef.current?.cameraAt(x, y) ?? null
    return id !== null && trackingCameraIds.has(id) ? id : null
  }

  /** 스튜디오 위 마우스 위치의 대상, 캔버스 좌표, 스튜디오 영역 안의 CSS 좌표 */
  const studioHitAt = (event: MouseEvent<HTMLDivElement>) => {
    const renderer = rendererRef.current
    const host = hostRef.current
    if (renderer === null || host === null) return null
    const rect = host.getBoundingClientRect()
    const point = clientToCanvas(event.clientX, event.clientY, rect, renderer.size)
    const hit = renderer.hitTest(point.x, point.y)
    // 출연자는 마우스 자리가 아니라 몸 중심에 카드를 붙여, 카드가 그 출연자를 덮지 않게 한다
    const center = hit?.kind === 'actor' ? renderer.anchorOf('actor', hit.id) : null
    const half = hit?.kind === 'actor' ? renderer.actorHalfSize(hit.id) : null
    const scaleX = rect.width / renderer.size.width
    const scaleY = rect.height / renderer.size.height
    return {
      hit,
      canvas: point,
      x: center === null ? event.clientX - rect.left : center.x * scaleX,
      y: center === null ? event.clientY - rect.top : center.y * scaleY,
      body:
        half === null ? undefined : { halfWidth: half.halfWidth * scaleX, halfHeight: half.halfHeight * scaleY },
    }
  }

  const studio: StudioBindings = {
    rowRef,
    hostRef,
    cardRef,
    linkRef,
    onClick: (event) => {
      if (aimDrag.consumeClick()) return
      const found = studioHitAt(event)
      if (found === null) return
      lastClickRef.current = { x: found.x, y: found.y, body: found.body }
      clickStudio(found.hit)
    },
    onPointerDown: (event) => {
      if (clickState.phase !== 'live' || event.button !== 0) return
      const found = studioHitAt(event)
      const cameraId = found === null ? null : trackingCameraAt(found.canvas.x, found.canvas.y)
      if (cameraId === null) return
      event.preventDefault()
      aimDrag.start(cameraId, event.clientX, event.clientY, true)
    },
    onAimDragStart: (cameraId, event) => {
      if (clickState.phase !== 'live' || event.button !== 0) return
      aimDrag.start(cameraId, event.clientX, event.clientY, false)
    },
    onMouseMove: (event) => {
      if (aimDrag.isDragging()) return
      const found = studioHitAt(event)
      const host = hostRef.current
      if (host !== null && found !== null) {
        // 끌 수 있는 카메라 표시 위에서는 잡는 손 모양으로 알린다.
        host.style.cursor = trackingCameraAt(found.canvas.x, found.canvas.y) === null ? '' : 'grab'
      }
      // 호버 설명은 개입 밖에서만(개입 중에는 판단 카드가 주인공이다).
      const hit = found === null || view === null || interventionOpen ? null : found.hit
      // 같은 대상 위에서 움직이면 자리를 옮기지 않는다(설명은 처음 올라간 자리에 머문다).
      const key = hit === null ? null : `${hit.kind}:${hit.id}`
      if (key === hoverKeyRef.current) return
      hoverKeyRef.current = key
      setHoverAnchor(hit === null || found === null ? null : { hit, x: found.x, y: found.y, body: found.body })
    },
    onMouseLeave: () => {
      hoverKeyRef.current = null
      setHoverAnchor(null)
    },
  }

  // 개입 중이거나 고정한 출연자가 이탈했으면 고정은 없는 것으로 친다(개입 시작 때 상태도 비운다)
  const livePinned = livePinnedAnchor(pinnedAnchor, view?.actors, interventionOpen)
  usePinnedDismiss(livePinned !== null, hostRef, clearInfo)

  // 고정한 자리가 있으면 호버는 카드를 바꾸지 않는다. 출연자는 정보 카드, 스태프·장비·현상은 말풍선이다.
  const tipAnchor = interventionOpen ? null : (livePinned ?? hoverAnchor)
  const actorCard: ActorCardAnchor | null =
    tipAnchor?.hit.kind === 'actor'
      ? { actorId: tipAnchor.hit.id, x: tipAnchor.x, y: tipAnchor.y, body: tipAnchor.body }
      : null
  const hoverTip: HoverTipState | null =
    tipAnchor === null || view === null ? null : resolveHoverTip(tipAnchor, view, setup)

  const onDirect = (input: BroadcastInput): void => {
    send(input)
    setSelectedTarget(null)
  }

  if (loop.error !== null) {
    return <ErrorScreen kind={loop.error.kind} message={loop.error.message} />
  }
  if (rendererError !== null) return <ErrorScreen kind="create" message={rendererError} />
  if (loop.result !== null) return (
      <ResultScreen result={loop.result} trend={trend.all()} show={show} onRestart={onRestart} />
    )

  return (
    <BroadcastStage
      view={view}
      setup={setup}
      controls={loop}
      trend={trend}
      selectedTarget={liveTarget}
      hoverTip={hoverTip}
      actorCard={actorCard}
      onSelectTarget={setSelectedTarget}
      onDirect={onDirect}
      onBeginIntervention={beginIntervention}
      studio={studio}
    />
  )
}
