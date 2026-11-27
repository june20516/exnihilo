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
