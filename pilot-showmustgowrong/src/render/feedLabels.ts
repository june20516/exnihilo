/** 이름표 하나를 놓을 요청. x는 가운데, bottom은 글자 아래쪽(몸 바로 위) 좌표다. */
export interface FeedLabelRequest {
  x: number
  bottom: number
  width: number
}

/** 놓인 이름표. x는 가운데, y는 글자 아래쪽 좌표다. */
export interface FeedLabelPlacement {
  x: number
  y: number
}

/** 원래 자리에서 겹칠 때 시도하는 세로 이동(줄 단위). 위로 먼저 올린다. */
const LINE_SHIFTS = [0, -1, 1, -2, 2, -3, 3]

interface LabelBox {
  left: number
  right: number
  top: number
  bottom: number
}

function boxOf(x: number, y: number, width: number, lineHeight: number): LabelBox {
  return { left: x - width / 2, right: x + width / 2, top: y - lineHeight, bottom: y }
}

function intersects(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/**
 * 카메라 피드 이름표 배치. 가로는 피드 폭 안으로 밀어 넣고(clamp), 이미 놓인 이름표와 겹치면
 * 줄 단위로 위아래로 엇갈려 놓는다. 세로도 피드 안에 머문다. 모두 막히면 원래 줄에 둔다.
 * 요청 순서대로 놓으므로 먼저 온 이름표가 원래 자리를 차지한다.
 */
export function layoutFeedLabels(
  requests: readonly FeedLabelRequest[],
  canvasWidth: number,
  canvasHeight: number,
  lineHeight: number,
  padding: number,
): FeedLabelPlacement[] {
  const placed: LabelBox[] = []
  return requests.map((request) => {
    const half = request.width / 2
    const x = Math.min(Math.max(request.x, padding + half), canvasWidth - padding - half)
    const minY = lineHeight
    const maxY = canvasHeight
    const baseY = Math.min(Math.max(request.bottom, minY), maxY)
    const candidates = LINE_SHIFTS.map((shift) => baseY + shift * lineHeight).filter(
      (y) => y >= minY && y <= maxY,
    )
    const y =
      candidates.find((candidate) => {
        const box = boxOf(x, candidate, request.width, lineHeight)
        return placed.every((other) => !intersects(box, other))
      }) ?? baseY
    placed.push(boxOf(x, y, request.width, lineHeight))
    return { x, y }
  })
}
