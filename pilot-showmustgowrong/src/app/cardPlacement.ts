interface Size {
  width: number
  height: number
}

/** 앵커(출연자 몸 중심) 둘레의 몸 상자 반 크기. 카드는 이 상자를 피해 놓는다 */
export interface BodyBox {
  halfWidth: number
  halfHeight: number
}

interface Point {
  x: number
  y: number
}

interface Placement {
  left: number
  top: number
}

/** 출연자 몸 중심(앵커) 둘레의 몸 상자 반 크기(CSS px). 카드는 이 상자를 덮지 않게 놓는다 */
export const ACTOR_BODY_BOX: BodyBox = { halfWidth: 30, halfHeight: 50 }

/** 몸 상자와 카드 사이 간격(px) */
export const CARD_GAP = 12

const NO_BODY: BodyBox = { halfWidth: 0, halfHeight: 0 }

/** 값을 [0, max] 안으로 민다. max가 0보다 작으면(카드가 더 크면) 0 */
function clampToBounds(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

/** 카드(자리 placement)와 몸 상자가 겹치는 넓이 */
function overlapArea(placement: Placement, card: Size, anchor: Point, body: BodyBox): number {
  const width =
    Math.min(placement.left + card.width, anchor.x + body.halfWidth) -
    Math.max(placement.left, anchor.x - body.halfWidth)
  const height =
    Math.min(placement.top + card.height, anchor.y + body.halfHeight) -
    Math.max(placement.top, anchor.y - body.halfHeight)
  return Math.max(0, width) * Math.max(0, height)
}

/**
 * 앵커(출연자 위치) 옆에 카드를 놓는다. 후보 순서는 오른쪽, 왼쪽, 아래, 위이고, 몸 상자에서 gap만큼
 * 떨어져 bounds 안에 들어가는 첫 후보를 쓴다. 옆 후보는 세로를, 아래·위 후보는 가로를 앵커 중심에 맞추고
 * bounds 안으로 민다. 어느 후보도 들어가지 않으면 몸 상자와 겹침이 가장 작은 후보를 쓴다(카드가
 * bounds보다 크면 0에 붙는다).
 */
export function placeCard(
  anchor: Point,
  card: Size,
  bounds: Size,
  gap = 12,
  body: BodyBox = NO_BODY,
): Placement {
  const centeredTop = clampToBounds(anchor.y - card.height / 2, bounds.height - card.height)
  const centeredLeft = clampToBounds(anchor.x - card.width / 2, bounds.width - card.width)
  const right = anchor.x + body.halfWidth + gap
  const left = anchor.x - body.halfWidth - gap - card.width
  const below = anchor.y + body.halfHeight + gap
  const above = anchor.y - body.halfHeight - gap - card.height
  const candidates: { fits: boolean; placement: Placement }[] = [
    {
      fits: right + card.width <= bounds.width,
      placement: { left: clampToBounds(right, bounds.width - card.width), top: centeredTop },
    },
    {
      fits: left >= 0,
      placement: { left: clampToBounds(left, bounds.width - card.width), top: centeredTop },
    },
    {
      fits: below + card.height <= bounds.height,
      placement: { left: centeredLeft, top: clampToBounds(below, bounds.height - card.height) },
    },
    {
      fits: above >= 0,
      placement: { left: centeredLeft, top: clampToBounds(above, bounds.height - card.height) },
    },
  ]
  const fitting = candidates.find((candidate) => candidate.fits)
  if (fitting !== undefined) return fitting.placement
  // 들어가는 후보가 없다: 겹침이 가장 작은 것(같으면 앞선 후보)
  let best = candidates[0]
  let bestOverlap = overlapArea(best.placement, card, anchor, body)
  for (const candidate of candidates.slice(1)) {
    const overlap = overlapArea(candidate.placement, card, anchor, body)
    if (overlap < bestOverlap) {
      best = candidate
      bestOverlap = overlap
    }
  }
  return best.placement
}

/**
 * 스튜디오 패널 안에 카드를 놓는다(좌표는 패널 안쪽 CSS px). 카드가 패널에 들어가면 placeCard로 패널 안에 놓는다.
 * 패널이 카드보다 작으면(송출 화면 크게의 스튜디오 축소판) 패널 안에 둘 수 없으므로, 화면(뷰포트) 안에
 * 들어가도록 같은 규칙으로 놓고 패널 좌표로 되돌린다. origin은 패널 안쪽 왼쪽 위의 화면 좌표다.
 */
export function placeCardInPanel(
  anchor: Point,
  card: Size,
  panel: Size,
  viewport: Size,
  origin: Point,
  gap = 12,
  body: BodyBox = NO_BODY,
): Placement {
  if (card.width <= panel.width && card.height <= panel.height) {
    return placeCard(anchor, card, panel, gap, body)
  }
  const inViewport = placeCard(
    { x: anchor.x + origin.x, y: anchor.y + origin.y },
    card,
    viewport,
    gap,
    body,
  )
  return { left: inViewport.left - origin.x, top: inViewport.top - origin.y }
}
