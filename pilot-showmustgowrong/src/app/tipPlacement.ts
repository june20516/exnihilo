/** 마우스와 말풍선 사이 간격(px) */
export const TIP_OFFSET = 14

export interface TipPlacementInput {
  /** 마우스 자리(말풍선이 붙는 요소 안의 CSS 좌표) */
  x: number
  y: number
  /** 말풍선 크기(CSS px) */
  width: number
  height: number
  /** 말풍선이 붙는 요소의 화면 위치(안쪽 테두리 기준, CSS px) */
  originLeft: number
  originTop: number
  /** 화면(뷰포트) 크기 */
  viewportWidth: number
  viewportHeight: number
}

/** 말풍선 왼쪽 위 자리(붙는 요소 안의 CSS 좌표) */
export interface TipPosition {
  left: number
  top: number
}

/**
 * 한 축의 자리. 마우스 뒤쪽(오른쪽·아래)에 두고, 화면 끝을 넘으면 앞쪽(왼쪽·위)으로 뒤집는다.
 * 뒤집어도 화면 시작을 넘으면 화면 안으로 밀어 넣는다(말풍선이 화면보다 크면 시작에 붙인다).
 */
function placeOnAxis(pointer: number, size: number, origin: number, viewport: number): number {
  const after = pointer + TIP_OFFSET
  const before = pointer - TIP_OFFSET - size
  const preferred = origin + after + size > viewport ? before : after
  const min = -origin
  const max = viewport - size - origin
  return Math.max(min, Math.min(max, preferred))
}

/** 호버 설명 말풍선 자리. 화면 오른쪽·아래를 넘으면 뒤집고, 그래도 넘치면 화면 안으로 밀어 넣는다 */
export function placeTip(input: TipPlacementInput): TipPosition {
  return {
    left: placeOnAxis(input.x, input.width, input.originLeft, input.viewportWidth),
    top: placeOnAxis(input.y, input.height, input.originTop, input.viewportHeight),
  }
}
