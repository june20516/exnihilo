import { useCallback, useEffect, useEffectEvent, useRef, type RefObject } from 'react'
import type { StudioRenderer } from '@/render/StudioRenderer'
import { clientToCanvas } from '@/render/geometry'
import type { BroadcastInput, BroadcastView } from '@/sim/engine'
import { aimDropInput, type StudioClickState } from './studioClick'

/** 이만큼(px) 움직여야 끌기로 본다. 그보다 짧으면 그냥 클릭이다(미리보기 버튼의 카메라 전환 등). */
const DRAG_THRESHOLD_PX = 4

interface AimDrag {
  cameraId: string
  startX: number
  startY: number
  moved: boolean
  /** 스튜디오 위에서 시작했으면 놓은 뒤 따라오는 click을 무시한다. */
  fromStudio: boolean
}

interface AimDragDeps {
  rendererRef: RefObject<StudioRenderer | null>
  hostRef: RefObject<HTMLDivElement | null>
  view: BroadcastView | null
  clickState: StudioClickState
  send(input: BroadcastInput): void
  /** 끌기가 실제로 시작될 때(호버 설명을 닫는 등) */
  onDragStart(): void
}

export interface AimDragControls {
  /** 카메라에서 끌기를 시작한다(포인터를 누른 자리, client 좌표). */
  start(cameraId: string, clientX: number, clientY: number, fromStudio: boolean): void
  /** 끌기가 진행 중인가(호버를 띄우지 않는다) */
  isDragging(): boolean
  /** 끌기를 놓은 직후의 click이면 true를 돌려주고 한 번만 소비한다. */
  consumeClick(): boolean
}

/**
 * 카메라를 끌어 출연자 위에 놓아 추적 대상을 바꾼다(spec 3.1의 공짜 조작). 끄는 동안 스튜디오에
 * 그 카메라가 커서(출연자 위면 그 출연자)를 향한 시야를 미리 그린다. 놓은 곳이 출연자가 아니면 취소.
 */
export function useAimDrag({
  rendererRef,
  hostRef,
  view,
  clickState,
  send,
  onDragStart,
}: AimDragDeps): AimDragControls {
  const dragRef = useRef<AimDrag | null>(null)
  const suppressClickRef = useRef(false)

  /** client 좌표가 스튜디오 위면 캔버스 좌표와 그 아래 대상, 아니면 null */
  const studioPointAt = useCallback(
    (clientX: number, clientY: number) => {
      const renderer = rendererRef.current
      const host = hostRef.current
      if (renderer === null || host === null) return null
      const rect = host.getBoundingClientRect()
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      if (!inside) return null
      const point = clientToCanvas(clientX, clientY, rect, renderer.size)
      return { point, hit: renderer.hitTest(point.x, point.y) }
    },
    [rendererRef, hostRef],
  )

  const setCursor = useCallback(
    (cursor: string | null) => {
      const host = hostRef.current
      if (host !== null) host.style.cursor = cursor ?? ''
    },
    [hostRef],
  )

  const onPointerMove = useEffectEvent((event: PointerEvent): void => {
    const drag = dragRef.current
    const renderer = rendererRef.current
    if (drag === null || renderer === null) return
    if (!drag.moved) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (distance < DRAG_THRESHOLD_PX) return
      drag.moved = true
      onDragStart()
      setCursor('grabbing')
    }
    const found = studioPointAt(event.clientX, event.clientY)
    if (found === null) {
      renderer.setAimPreview(null)
      return
    }
    // 출연자 위면 그 출연자에 맞춰 보여 준다(놓으면 실제로 그쪽을 따라간다).
    const actor =
      found.hit?.kind === 'actor' && clickState.activeActorIds.has(found.hit.id)
        ? view?.actors.find((candidate) => candidate.id === found.hit?.id)
        : undefined
    const floorPoint =
      actor === undefined ? renderer.floorAt(found.point.x, found.point.y) : actor
    renderer.setAimPreview({ cameraId: drag.cameraId, floorPoint: { x: floorPoint.x, z: floorPoint.z } })
  })

  const onPointerUp = useEffectEvent((event: PointerEvent): void => {
    const drag = dragRef.current
    if (drag === null) return
    dragRef.current = null
    rendererRef.current?.setAimPreview(null)
    setCursor(null)
    if (!drag.moved) return
    suppressClickRef.current = drag.fromStudio
    const found = studioPointAt(event.clientX, event.clientY)
    const input = aimDropInput(found?.hit ?? null, clickState, drag.cameraId)
    if (input !== null) send(input)
  })

  useEffect(() => {
    const move = (event: PointerEvent): void => onPointerMove(event)
    const up = (event: PointerEvent): void => onPointerUp(event)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  return {
    start: useCallback((cameraId, clientX, clientY, fromStudio) => {
      dragRef.current = { cameraId, startX: clientX, startY: clientY, moved: false, fromStudio }
    }, []),
    isDragging: useCallback(() => dragRef.current?.moved === true, []),
    consumeClick: useCallback(() => {
      const suppressed = suppressClickRef.current
      suppressClickRef.current = false
      return suppressed
    }, []),
  }
}
