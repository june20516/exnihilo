/** 이름표 글자 크기 = 피드 높이 × 이 비율(상한·하한 안에서) */
export const NAME_FONT_RATIO = 0.05
export const MIN_NAME_FONT_PX = 10
/**
 * 이름표 글자 크기 상한(px). 1280×720 기본 배치의 송출 모니터 피드(약 472×265)에서 0.05 비율로 나오는
 * 약 13.3px를 올림한 값이다. 송출 화면 크게(피드 약 700×600)에서도 이보다 커지지 않아 이름표가
 * 출연자 얼굴을 가리지 않는다.
 */
export const MAX_NAME_FONT_PX = 14

/** 피드 높이(px)에 맞춘 이름표 글자 크기. 작은 미리보기는 하한, 큰 모니터는 상한에 걸린다 */
export function feedNameFontSize(feedHeight: number): number {
  return Math.min(MAX_NAME_FONT_PX, Math.max(MIN_NAME_FONT_PX, feedHeight * NAME_FONT_RATIO))
}

/** 이름표 하나를 놓을 요청. x는 가운데, bottom은 글자 아래쪽(몸 바로 위) 좌표다. */
export interface FeedLabelRequest {
  x: number
  bottom: number
  width: number
}

/** 놓인 이름표. x는 가운데, y는 글자 아래쪽 좌표다. */
export interface FeedLabelPlacement {
  readonly x: number
  readonly y: number
}

interface LabelBox {
  left: number
  right: number
  top: number
  bottom: number
}

interface Candidate {
  x: number
  y: number
}

function boxOf(x: number, y: number, width: number, lineHeight: number): LabelBox {
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - lineHeight,
    bottom: y,
  }
}

/** 두 상자가 겹친 넓이. 겹치지 않으면 0 */
function overlapArea(a: LabelBox, b: LabelBox): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return width > 0 && height > 0 ? width * height : 0
}

/** 가로로 비켜 보는 간격(이름표 높이 대비). 작을수록 촘촘히 채운다 */
const HORIZONTAL_STEP_RATIO = 0.5

/** 기준에서 가까운 순으로 정렬한 값들 */
function nearestFirst(values: Iterable<number>, origin: number): number[] {
  return [...new Set(values)].sort((a, b) => Math.abs(a - origin) - Math.abs(b - origin) || a - b)
}

/** 겹치지 않는 배치를 찾으려고 되돌아가며 시도할 수 있는 최대 횟수 */
const SEARCH_BUDGET = 5000

/** 이름표 하나가 놓일 수 있는 자리 후보. 원래 자리에서 가까운 순 */
function candidatesFor(
  request: FeedLabelRequest,
  canvasWidth: number,
  canvasHeight: number,
  lineHeight: number,
  padding: number,
): Candidate[] {
  const half = request.width / 2
  const minX = padding + half
  const maxX = Math.max(canvasWidth - padding - half, minX)
  const minY = lineHeight
  const maxY = Math.max(canvasHeight, minY)
  const x = Math.min(Math.max(request.x, minX), maxX)
  const baseY = Math.min(Math.max(request.bottom, minY), maxY)

  // 줄: 원래 줄, 그리고 화면 아래에서부터 이름표 높이로 나눈 줄들. 한 격자에 맞춰 둬야
  // 이름표가 어긋나 걸치지 않고 빈틈없이 쌓인다.
  const rowValues = [baseY]
  for (let y = maxY; y >= minY; y -= lineHeight) rowValues.push(y)
  // 가로: 원래 가로 위치에서 좌우로 한 간격씩
  const step = Math.max(1, lineHeight * HORIZONTAL_STEP_RATIO)
  const columnValues = [x]
  for (let dx = step; x - dx >= minX || x + dx <= maxX; dx += step) {
    if (x - dx >= minX) columnValues.push(x - dx)
    if (x + dx <= maxX) columnValues.push(x + dx)
  }
  const rows = nearestFirst(rowValues, baseY)
  // 같은 가로에서 줄만 바꾸는 후보가 먼저, 그다음 가로로 비킨 후보
  return nearestFirst(columnValues, x).flatMap((column) => rows.map((y) => ({ x: column, y })))
}

/**
 * 카메라 피드 이름표 배치. 가로는 피드 폭 안으로 밀어 넣고(clamp), 이미 놓인 이름표와 겹치면
 * 원래 가로 위치에서 줄을 위아래로 엇갈려 놓고, 그래도 자리가 없으면 가로로도 비켜 놓는다.
 * 앞 이름표 때문에 뒤가 막히면 되돌아가 다시 놓는다. 겹치지 않는 배치가 없으면 이름표마다
 * 겹침 넓이가 가장 작은 자리를 쓴다(throw하지 않는다). 겹치지 않는 한 먼저 온 이름표가 원래 자리를 차지한다.
 */
function computeLayout(
  requests: readonly FeedLabelRequest[],
  canvasWidth: number,
  canvasHeight: number,
  lineHeight: number,
  padding: number,
): FeedLabelPlacement[] {
  const options = requests.map((request) =>
    candidatesFor(request, canvasWidth, canvasHeight, lineHeight, padding),
  )
  const boxAt = (index: number, candidate: Candidate): LabelBox =>
    boxOf(candidate.x, candidate.y, requests[index].width, lineHeight)

  // 1) 겹치지 않는 배치를 되돌아가며 찾는다
  const chosen: Candidate[] = []
  let budget = SEARCH_BUDGET
  const search = (index: number): boolean => {
    if (index === requests.length) return true
    for (const candidate of options[index]) {
      if (budget <= 0) return false
      budget -= 1
      const box = boxAt(index, candidate)
      if (chosen.some((other, otherIndex) => overlapArea(box, boxAt(otherIndex, other)) > 0)) {
        continue
      }
      chosen.push(candidate)
      if (search(index + 1)) return true
      chosen.pop()
    }
    return false
  }
  if (search(0)) return chosen

  // 2) 없으면 앞에서부터 겹침이 가장 작은 자리에 놓는다. 전역 최소가 아니라 이름표별 탐욕이다:
  //    앞 이름표를 고정한 채 하나씩 고르므로 조합이 폭발하지 않는다.
  const fallback: Candidate[] = []
  options.forEach((candidates, index) => {
    let best = candidates[0]
    let bestOverlap = Infinity
    for (const candidate of candidates) {
      const box = boxAt(index, candidate)
      const overlap = fallback.reduce(
        (sum, other, otherIndex) => sum + overlapArea(box, boxAt(otherIndex, other)),
        0,
      )
      if (overlap < bestOverlap) {
        best = candidate
        bestOverlap = overlap
      }
    }
    fallback.push(best)
  })
  return fallback
}

/** 직전 배치 입력과 결과. 같은 입력이면 다시 계산하지 않는다(그리기가 자주 불린다) */
let lastKey = ''
let lastResult: readonly FeedLabelPlacement[] = []

/** 이름표 배치(위 설명). 입력이 직전과 같으면 직전 결과를 그대로 돌려준다. */
export function layoutFeedLabels(
  requests: readonly FeedLabelRequest[],
  canvasWidth: number,
  canvasHeight: number,
  lineHeight: number,
  padding: number,
): readonly FeedLabelPlacement[] {
  const key = JSON.stringify([requests, canvasWidth, canvasHeight, lineHeight, padding])
  if (key !== lastKey) {
    lastResult = computeLayout(requests, canvasWidth, canvasHeight, lineHeight, padding)
    lastKey = key
  }
  return lastResult
}
