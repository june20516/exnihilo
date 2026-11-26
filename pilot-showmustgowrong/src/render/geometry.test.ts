import { describe, expect, it } from 'vitest'
import { STUDIO_DEPTH, STUDIO_WIDTH } from '@/content/balance'
import {
  ISO_VIEW_HEIGHT,
  cameraFanFloorPoints,
  clipToFloor,
  clientToCanvas,
  depthKey,
  fitIso,
  floorEllipseRadii,
  pointInPolygon,
  projectIso,
  rotateByQuaternion,
  screenTilt,
  unprojectFloor,
  visibleBoxFaces,
  type IsoTransform,
} from './geometry'

const UNIT: IsoTransform = { scale: 10, originX: 100, originY: 50 }
const EPSILON = 1e-6

describe('projectIso', () => {
  it('(0,0,0)과 (1,0,1)은 화면 x가 같고 뒤의 것이 아래에 있다', () => {
    const origin = projectIso({ x: 0, y: 0, z: 0 }, UNIT)
    const diagonal = projectIso({ x: 1, y: 0, z: 1 }, UNIT)
    expect(diagonal.x).toBeCloseTo(origin.x)
    expect(diagonal.y).toBeGreaterThan(origin.y)
  })

  it('y가 1 커지면 화면 y가 scale만큼 작아진다', () => {
    const ground = projectIso({ x: 3, y: 0, z: 2 }, UNIT)
    const raised = projectIso({ x: 3, y: 1, z: 2 }, UNIT)
    expect(raised.x).toBeCloseTo(ground.x)
    expect(ground.y - raised.y).toBeCloseTo(UNIT.scale)
  })

  it('x는 화면 오른쪽 아래, z는 왼쪽 아래로 간다', () => {
    const origin = projectIso({ x: 0, y: 0, z: 0 }, UNIT)
    const alongX = projectIso({ x: 1, y: 0, z: 0 }, UNIT)
    const alongZ = projectIso({ x: 0, y: 0, z: 1 }, UNIT)
    expect(alongX.x).toBeCloseTo(origin.x + Math.cos(Math.PI / 6) * UNIT.scale)
    expect(alongX.y).toBeCloseTo(origin.y + Math.sin(Math.PI / 6) * UNIT.scale)
    expect(alongZ.x).toBeCloseTo(origin.x - Math.cos(Math.PI / 6) * UNIT.scale)
    expect(alongZ.y).toBeCloseTo(alongX.y)
  })
})

describe('fitIso', () => {
  const width = 760
  const height = 560
  const padding = 16
  const transform = fitIso(width, height, padding)
  const floorCorners = [
    { x: 0, y: 0, z: 0 },
    { x: STUDIO_WIDTH, y: 0, z: 0 },
    { x: 0, y: 0, z: STUDIO_DEPTH },
    { x: STUDIO_WIDTH, y: 0, z: STUDIO_DEPTH },
  ]
  const boxCorners = [
    ...floorCorners,
    ...floorCorners.map((corner) => ({ ...corner, y: ISO_VIEW_HEIGHT })),
  ]

  it('스튜디오 바닥 네 모서리가 여백 안에 들어간다', () => {
    for (const corner of floorCorners) {
      const point = projectIso(corner, transform)
      expect(point.x).toBeGreaterThanOrEqual(padding - EPSILON)
      expect(point.x).toBeLessThanOrEqual(width - padding + EPSILON)
      expect(point.y).toBeGreaterThanOrEqual(padding - EPSILON)
      expect(point.y).toBeLessThanOrEqual(height - padding + EPSILON)
    }
  })

  it('바닥부터 천장 높이까지의 상자가 가로나 세로 한쪽 여백에 닿는다(꽉 참)', () => {
    const points = boxCorners.map((corner) => projectIso(corner, transform))
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const touchesHorizontal =
      Math.abs(Math.min(...xs) - padding) < EPSILON &&
      Math.abs(Math.max(...xs) - (width - padding)) < EPSILON
    const touchesVertical =
      Math.abs(Math.min(...ys) - padding) < EPSILON &&
      Math.abs(Math.max(...ys) - (height - padding)) < EPSILON
    expect(touchesHorizontal || touchesVertical).toBe(true)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(padding - EPSILON)
    expect(Math.max(...xs)).toBeLessThanOrEqual(width - padding + EPSILON)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(padding - EPSILON)
    expect(Math.max(...ys)).toBeLessThanOrEqual(height - padding + EPSILON)
  })
})

describe('depthKey', () => {
  it('x + z가 클수록 앞이다', () => {
    expect(depthKey({ x: 1, y: 5, z: 2 })).toBe(3)
    expect(depthKey({ x: 4, y: 0, z: 4 })).toBeGreaterThan(depthKey({ x: 1, y: 0, z: 6 }))
  })
})

describe('clientToCanvas', () => {
  it('CSS로 0.5배 표시한 캔버스의 클릭 좌표가 투영된 출연자 중심과 2px 안에서 일치한다', () => {
    const canvas = { width: 960, height: 540 }
    const transform = fitIso(canvas.width, canvas.height, 16)
    const actorCenter = projectIso({ x: 4.5, y: 0.85, z: 4 }, transform)
    const rect = { left: 30, top: 70, width: canvas.width / 2, height: canvas.height / 2 }
    // 사용자가 줄어든 화면에서 출연자 중심을 누른 위치
    const clientX = rect.left + actorCenter.x / 2
    const clientY = rect.top + actorCenter.y / 2
    const point = clientToCanvas(clientX, clientY, rect, canvas)
    expect(Math.abs(point.x - actorCenter.x)).toBeLessThan(2)
    expect(Math.abs(point.y - actorCenter.y)).toBeLessThan(2)
  })
})

describe('screenTilt', () => {
  it('서 있으면 0이다', () => {
    expect(screenTilt({ x: 0, y: 1, z: 0 })).toBeCloseTo(0)
  })

  it('+x로 누우면 화면 오른쪽(시계 방향 +)으로, +z로 누우면 왼쪽으로 기운다', () => {
    expect(screenTilt({ x: 1, y: 0, z: 0 })).toBeGreaterThan(0)
    expect(screenTilt({ x: 0, y: 0, z: 1 })).toBeLessThan(0)
  })
})

describe('floorEllipseRadii', () => {
  it('바닥 원은 가로가 세로보다 긴 타원으로 보인다', () => {
    const { rx, ry } = floorEllipseRadii(2, 10)
    expect(rx).toBeCloseTo(Math.SQRT2 * Math.cos(Math.PI / 6) * 20)
    expect(ry).toBeCloseTo(Math.SQRT2 * Math.sin(Math.PI / 6) * 20)
  })

  it('투영한 바닥 원 위의 점이 그 타원 안에 있다', () => {
    const radius = 3
    const center = projectIso({ x: 5, y: 0, z: 5 }, UNIT)
    const { rx, ry } = floorEllipseRadii(radius, UNIT.scale)
    for (const angle of [0, 0.7, 2, 4]) {
      const point = projectIso(
        { x: 5 + Math.cos(angle) * radius, y: 0, z: 5 + Math.sin(angle) * radius },
        UNIT,
      )
      const value = ((point.x - center.x) / rx) ** 2 + ((point.y - center.y) / ry) ** 2
      expect(value).toBeLessThanOrEqual(1 + EPSILON)
    }
  })
})

describe('cameraFanFloorPoints', () => {
  it('첫 점은 카메라 바로 아래 바닥이고 호 분할 + 2점이다', () => {
    const points = cameraFanFloorPoints({ x: 8, y: 5, z: 9 }, -90, 60, 4, 6)
    expect(points[0]).toEqual({ x: 8, y: 0, z: 9 })
    expect(points).toHaveLength(2 + 6)
  })

  it('yaw -90도(−z)는 무대 안쪽을 향하고 0도는 +x를 향한다', () => {
    const back = cameraFanFloorPoints({ x: 8, y: 5, z: 9 }, -90, 0, 4, 1)[1]
    expect(back.x).toBeCloseTo(8)
    expect(back.z).toBeCloseTo(5)
    const right = cameraFanFloorPoints({ x: 8, y: 5, z: 9 }, 0, 0, 4, 1)[1]
    expect(right.x).toBeCloseTo(12)
    expect(right.z).toBeCloseTo(9)
  })
})

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('안쪽 점은 true, 바깥 점은 false다', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })
})

describe('rotateByQuaternion', () => {
  it('y축 +90도 회전은 +x를 −z로 보낸다', () => {
    const half = Math.SQRT1_2
    const rotated = rotateByQuaternion({ x: 1, y: 0, z: 0 }, { x: 0, y: half, z: 0, w: half })
    expect(rotated.x).toBeCloseTo(0)
    expect(rotated.y).toBeCloseTo(0)
    expect(rotated.z).toBeCloseTo(-1)
  })
})

describe('visibleBoxFaces', () => {
  it('돌리지 않은 상자는 윗면, +x면, +z면 세 개가 보인다', () => {
    const faces = visibleBoxFaces(
      { x: 5, y: 1, z: 5 },
      { hx: 1, hy: 1, hz: 1 },
      { x: 0, y: 0, z: 0, w: 1 },
      UNIT,
    )
    const normals = faces.map((face) => face.normal)
    expect(normals).toHaveLength(3)
    expect(normals).toContainEqual({ x: 1, y: 0, z: 0 })
    expect(normals).toContainEqual({ x: 0, y: 1, z: 0 })
    expect(normals).toContainEqual({ x: 0, y: 0, z: 1 })
    for (const face of faces) expect(face.corners).toHaveLength(4)
  })
})

describe('clipToFloor', () => {
  it('바닥 밖으로 나간 부분을 경계에서 자른다', () => {
    const triangle = [
      { x: 2, y: 0, z: 2 },
      { x: 6, y: 0, z: 2 },
      { x: 2, y: 0, z: 6 },
    ]
    const clipped = clipToFloor(triangle, { minX: 0, maxX: 4, minZ: 0, maxZ: 10 })
    for (const point of clipped) expect(point.x).toBeLessThanOrEqual(4 + EPSILON)
    expect(clipped).toContainEqual({ x: 4, y: 0, z: 2 })
    expect(clipped).toContainEqual({ x: 4, y: 0, z: 4 })
    expect(clipped).toContainEqual({ x: 2, y: 0, z: 6 })
  })

  it('안에 있는 다각형은 그대로, 완전히 밖이면 빈 배열이다', () => {
    const inside = [
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      { x: 1, y: 0, z: 2 },
    ]
    const bounds = { minX: 0, maxX: 16, minZ: 0, maxZ: 10 }
    expect(clipToFloor(inside, bounds)).toHaveLength(3)
    const outside = inside.map((point) => ({ ...point, x: point.x + 20 }))
    expect(clipToFloor(outside, bounds)).toEqual([])
  })
})

describe('unprojectFloor', () => {
  it('바닥 점을 투영했다가 되돌리면 같은 점이다', () => {
    const transform = fitIso(1000, 600, 20)
    for (const point of [
      { x: 0, z: 0 },
      { x: 12.5, z: 4 },
      { x: 3.3, z: 9.1 },
    ]) {
      const back = unprojectFloor(projectIso({ ...point, y: 0 }, transform), transform)
      expect(back.x).toBeCloseTo(point.x)
      expect(back.z).toBeCloseTo(point.z)
    }
  })
})
