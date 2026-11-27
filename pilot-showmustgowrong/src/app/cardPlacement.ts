interface Size {
  width: number
  height: number
}

/** 값을 [0, max] 안으로 민다. max가 0보다 작으면(카드가 더 크면) 0 */
function clampToBounds(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

/**
 * 앵커(출연자 위치) 옆에 카드를 놓는다. 오른쪽 우선, 넘치면 왼쪽.
 * 세로는 앵커 중심에 카드 중심을 맞추고 bounds 안으로 민다. 카드가 bounds보다 크면 0에 붙인다.
 */
export function placeCard(
  anchor: { x: number; y: number },
  card: Size,
  bounds: Size,
  gap = 12,
): { left: number; top: number } {
  const rightLeft = anchor.x + gap
  const left = rightLeft + card.width <= bounds.width ? rightLeft : anchor.x - gap - card.width
  return {
    left: clampToBounds(left, bounds.width - card.width),
    top: clampToBounds(anchor.y - card.height / 2, bounds.height - card.height),
  }
}

/**
 * 스튜디오 패널 안에 카드를 놓는다(좌표는 패널 안쪽 CSS px). 카드가 패널에 들어가면 placeCard로 패널 안에 놓는다.
 * 패널이 카드보다 작으면(송출 화면 크게의 스튜디오 축소판) 패널 안에 둘 수 없으므로, 화면(뷰포트) 안에
 * 들어가도록 같은 규칙으로 놓고 패널 좌표로 되돌린다. origin은 패널 안쪽 왼쪽 위의 화면 좌표다.
 */
export function placeCardInPanel(
  anchor: { x: number; y: number },
  card: Size,
  panel: Size,
  viewport: Size,
  origin: { x: number; y: number },
  gap = 12,
): { left: number; top: number } {
  if (card.width <= panel.width && card.height <= panel.height) {
    return placeCard(anchor, card, panel, gap)
  }
  const inViewport = placeCard({ x: anchor.x + origin.x, y: anchor.y + origin.y }, card, viewport, gap)
  return { left: inViewport.left - origin.x, top: inViewport.top - origin.y }
}
