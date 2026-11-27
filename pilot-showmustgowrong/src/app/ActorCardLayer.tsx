import { useLayoutEffect, useRef } from 'react'
import type { PerformerDef } from '@/content/types'
import type { ActorView } from '@/sim/engineTypes'
import { ActorInfoCard } from './ActorInfoCard'
import { ACTOR_BODY_BOX, CARD_GAP, placeCardInPanel } from './cardPlacement'

/** 카드를 띄울 출연자와 자리(스튜디오 패널 안쪽 CSS 좌표) */
export interface ActorCardAnchor {
  actorId: string
  x: number
  y: number
}

interface ActorCardLayerProps {
  anchor: ActorCardAnchor
  actor: ActorView
  performer: PerformerDef
  nameOf: (id: string) => string
}

/**
 * 스튜디오 패널(offsetParent) 안에 정보 카드를 놓는다. 카드 크기를 잰 뒤 placeCardInPanel로 자리를 정하고,
 * 그 전에는 숨겨 두어(visibility) 엉뚱한 자리에서 깜박이지 않게 한다. 내용 높이가 프레임마다 바뀔 수 있어 렌더마다 다시 잰다.
 */
export function ActorCardLayer({ anchor, actor, performer, nameOf }: ActorCardLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null)

  // 의존성 배열이 없어 렌더마다 돈다. 방송 화면은 프레임마다 다시 그려지지만 이 effect는 크기 두 개와
  // 사각형 하나를 읽고 style 세 줄을 쓰는 정도라 프레임당 비용이 무시할 만하다(setState가 없어 렌더가 더 늘지 않는다).
  useLayoutEffect(() => {
    const layer = layerRef.current
    const panel = layer?.offsetParent
    if (layer === null || !(panel instanceof HTMLElement)) return
    const rect = panel.getBoundingClientRect()
    const next = placeCardInPanel(
      { x: anchor.x, y: anchor.y },
      { width: layer.offsetWidth, height: layer.offsetHeight },
      { width: panel.clientWidth, height: panel.clientHeight },
      { width: window.innerWidth, height: window.innerHeight },
      { x: rect.left + panel.clientLeft, y: rect.top + panel.clientTop },
      CARD_GAP,
      ACTOR_BODY_BOX,
    )
    // 자리는 렌더를 거치지 않고 바로 쓴다(재측정마다 setState하지 않는다)
    layer.style.left = `${next.left}px`
    layer.style.top = `${next.top}px`
    layer.style.visibility = 'visible'
  })

  return (
    <div
      ref={layerRef}
      data-testid="actor-card-layer"
      className="pointer-events-none absolute z-20 w-max"
      style={{ visibility: 'hidden' }}
    >
      <ActorInfoCard actor={actor} performer={performer} nameOf={nameOf} />
    </div>
  )
}
