import { layoutFeedLabels, type FeedLabelRequest } from './feedLabels'

const CANVAS_WIDTH = 200
const CANVAS_HEIGHT = 100
const LINE_HEIGHT = 12
const PADDING = 2

function layout(requests: FeedLabelRequest[]) {
  return layoutFeedLabels(requests, CANVAS_WIDTH, CANVAS_HEIGHT, LINE_HEIGHT, PADDING)
}

function overlaps(
  a: { x: number; y: number; width: number },
  b: { x: number; y: number; width: number },
): boolean {
  const horizontal = Math.abs(a.x - b.x) < (a.width + b.width) / 2
  const vertical = Math.abs(a.y - b.y) < LINE_HEIGHT
  return horizontal && vertical
}

describe('layoutFeedLabels', () => {
  it('겹치지 않는 이름표는 원래 자리(몸 위) 그대로다', () => {
    const placed = layout([
      { x: 50, bottom: 60, width: 30 },
      { x: 150, bottom: 60, width: 30 },
    ])
    expect(placed).toEqual([
      { x: 50, y: 60 },
      { x: 150, y: 60 },
    ])
  })

  it('양쪽 끝의 이름표는 피드 폭 안으로 들어온다', () => {
    const [left, right] = layout([
      { x: 0, bottom: 60, width: 40 },
      { x: CANVAS_WIDTH, bottom: 60, width: 40 },
    ])
    expect(left.x - 20).toBeGreaterThanOrEqual(PADDING)
    expect(right.x + 20).toBeLessThanOrEqual(CANVAS_WIDTH - PADDING)
  })

  it('겹치는 이름표는 세로로 엇갈려 서로 겹치지 않는다', () => {
    const requests = [
      { x: 10, bottom: 60, width: 60 },
      { x: 20, bottom: 60, width: 60 },
      { x: 30, bottom: 62, width: 60 },
    ]
    const placed = layout(requests)
    const boxes = placed.map((point, index) => ({ ...point, width: requests[index].width }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false)
    }
    for (const point of placed) {
      expect(point.y - LINE_HEIGHT).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(CANVAS_HEIGHT)
    }
  })

  /** 다섯 이름표(폭 34)가 한 점에 몰린 요청 */
  function crowd(x: number, bottom: number) {
    return Array.from({ length: 5 }, () => ({ x, bottom, width: 34 }))
  }

  function expectNoOverlapInside(
    requests: { width: number }[],
    placed: { x: number; y: number }[],
    canvasWidth: number,
    canvasHeight: number,
    lineHeight: number,
  ) {
    const boxes = placed.map((point, index) => ({
      left: point.x - requests[index].width / 2,
      right: point.x + requests[index].width / 2,
      top: point.y - lineHeight,
      bottom: point.y,
    }))
    boxes.forEach((box, i) => {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(canvasWidth)
      expect(box.top).toBeGreaterThanOrEqual(0)
      expect(box.bottom).toBeLessThanOrEqual(canvasHeight)
      for (const other of boxes.slice(i + 1)) {
        const separated =
          box.right <= other.left ||
          other.right <= box.left ||
          box.bottom <= other.top ||
          other.bottom <= box.top
        expect(separated).toBe(true)
      }
    })
  }

  it('다섯 이름표가 한 점에 몰려도 결과 상자끼리 겹치지 않고 화면 안에 있다', () => {
    const requests = crowd(132, 90)
    const placed = layoutFeedLabels(requests, 264, 149, 13, 2)
    expectNoOverlapInside(requests, placed, 264, 149, 13)
  })

  it('미리보기 크기(84x47)에서도 겹치지 않는다', () => {
    const requests = crowd(42, 30)
    const placed = layoutFeedLabels(requests, 84, 47, 12.5, 2)
    expectNoOverlapInside(requests, placed, 84, 47, 12.5)
  })

  it('이름표 높이를 넘는 세로 공간이 없으면 가장 덜 겹치는 배치를 돌려주고 throw하지 않는다', () => {
    // 높이 12, 폭 84 캔버스에 폭 34 이름표 다섯 개: 줄이 하나뿐이고 가로로도 다 못 들어가 반드시 겹친다
    const requests = crowd(42, 10)
    const placed = layoutFeedLabels(requests, 84, 12, 12, 2)
    expect(placed).toHaveLength(5)
    const overlapSum = (points: { x: number; y: number }[]) => {
      let sum = 0
      points.forEach((a, i) => {
        for (const b of points.slice(i + 1)) {
          const width = Math.max(0, 34 - Math.abs(a.x - b.x))
          const height = Math.max(0, 12 - Math.abs(a.y - b.y))
          sum += width * height
        }
      })
      return sum
    }
    const stacked = requests.map(() => ({ x: 42, y: 12 }))
    expect(overlapSum(placed)).toBeGreaterThan(0)
    expect(overlapSum(placed)).toBeLessThan(overlapSum(stacked))
    for (const point of placed) {
      expect(point.x - 17).toBeGreaterThanOrEqual(0)
      expect(point.x + 17).toBeLessThanOrEqual(84)
    }
  })

  it('같은 입력이면 직전 배치 결과를 그대로 돌려준다', () => {
    const requests = crowd(42, 30)
    expect(layoutFeedLabels(requests, 84, 47, 12.5, 2)).toBe(
      layoutFeedLabels(requests, 84, 47, 12.5, 2),
    )
  })
})
