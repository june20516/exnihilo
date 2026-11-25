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
})
