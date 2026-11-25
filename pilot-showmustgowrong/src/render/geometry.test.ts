import { describe, expect, it } from 'vitest'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PIXELS_PER_METER,
  cameraFanPoints,
  capsuleEndpoints,
  capsuleVerticalExtent,
  clientToCanvas,
  distanceToSegment,
  toScreen,
} from './geometry'

describe('toScreen', () => {
  it('바닥 왼쪽 끝은 화면 왼쪽 아래, y가 커지면 화면 위로 간다', () => {
    expect(toScreen(0, 0)).toEqual({ x: 0, y: CANVAS_HEIGHT })
    expect(toScreen(2, 3)).toEqual({
      x: 2 * PIXELS_PER_METER,
      y: CANVAS_HEIGHT - 3 * PIXELS_PER_METER,
    })
  })
})

describe('cameraFanPoints', () => {
  const origin = { x: 4, y: 2 }
  const originScreen = toScreen(origin.x, origin.y)

  it('첫 점은 카메라 위치이고 꼭짓점 수는 호 분할 + 2점이다', () => {
    const points = cameraFanPoints(origin, 0, 60, 3, 4)
    expect(points.slice(0, 2)).toEqual([originScreen.x, originScreen.y])
    expect(points).toHaveLength(2 + (4 + 1) * 2)
  })

  it('0도는 화면 오른쪽을 향한다', () => {
    const points = cameraFanPoints(origin, 0, 0, 3, 2)
    const [x, y] = points.slice(-2)
    expect(x).toBeCloseTo(originScreen.x + 3 * PIXELS_PER_METER)
    expect(y).toBeCloseTo(originScreen.y)
  })

  it('90도는 화면 위쪽(y 감소)을 향하고 -90도는 아래쪽을 향한다', () => {
    const up = cameraFanPoints(origin, 90, 0, 3, 2).slice(-2)
    expect(up[0]).toBeCloseTo(originScreen.x)
    expect(up[1]).toBeCloseTo(originScreen.y - 3 * PIXELS_PER_METER)
    const down = cameraFanPoints(origin, -90, 0, 3, 2).slice(-2)
    expect(down[1]).toBeCloseTo(originScreen.y + 3 * PIXELS_PER_METER)
  })

  it('화각은 중심각 양쪽으로 절반씩 퍼진다', () => {
    const points = cameraFanPoints(origin, 0, 90, 1, 1)
    const first = points.slice(2, 4)
    const last = points.slice(4, 6)
    // 0도 중심, 화각 90도 → -45도(화면 아래)와 +45도(화면 위)
    expect(first[1]).toBeGreaterThan(originScreen.y)
    expect(last[1]).toBeLessThan(originScreen.y)
  })
})

describe('capsuleEndpoints', () => {
  it('서 있으면 중심 위아래 반 높이 지점이다', () => {
    const [top, bottom] = capsuleEndpoints(1, 1, 0)
    const center = toScreen(1, 1)
    expect(top.x).toBeCloseTo(center.x)
    expect(top.y).toBeLessThan(center.y)
    expect(bottom.y).toBeGreaterThan(center.y)
  })

  it('반시계 +90도로 누우면 위쪽 끝이 화면 왼쪽으로 간다', () => {
    const [top, bottom] = capsuleEndpoints(1, 1, Math.PI / 2)
    const center = toScreen(1, 1)
    expect(top.x).toBeLessThan(center.x)
    expect(top.y).toBeCloseTo(center.y)
    expect(bottom.x).toBeGreaterThan(center.x)
  })
})

describe('capsuleVerticalExtent', () => {
  it('누우면 서 있을 때보다 줄어들고 반지름 아래로는 줄지 않는다', () => {
    expect(capsuleVerticalExtent(Math.PI / 2)).toBeLessThan(capsuleVerticalExtent(0))
    expect(capsuleVerticalExtent(Math.PI / 2)).toBeGreaterThan(0)
  })
})

describe('distanceToSegment', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }

  it('선분 위 수직 거리를 잰다', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3)
  })

  it('선분 밖이면 가까운 끝점까지 거리를 잰다', () => {
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5)
  })

  it('길이 0인 선분은 점까지 거리다', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5)
  })
})

describe('clientToCanvas', () => {
  it('CSS로 줄인 캔버스의 클릭 좌표를 논리 좌표(1280×720)로 환산한다', () => {
    const rect = { left: 10, top: 20, width: 960, height: 540 }
    expect(clientToCanvas(10 + 480, 20 + 270, rect)).toEqual({ x: 640, y: 360 })
    expect(clientToCanvas(10 + 960, 20 + 540, rect)).toEqual({ x: CANVAS_WIDTH, y: CANVAS_HEIGHT })
  })
})
