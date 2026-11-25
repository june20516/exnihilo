import { CAPSULE, STUDIO_HEIGHT, STUDIO_WIDTH } from '@/content/balance'
import type { Vec3 } from '@/sim/vec'

/** 1m당 픽셀 수. 16m × 9m가 1280×720이 된다. */
export const PIXELS_PER_METER = 80
export const CANVAS_WIDTH = STUDIO_WIDTH * PIXELS_PER_METER
export const CANVAS_HEIGHT = STUDIO_HEIGHT * PIXELS_PER_METER

export interface Point {
  x: number
  y: number
}

/** 물리 좌표(m, 위가 +y)를 화면 좌표(px, 아래가 +y)로 바꾼다. */
export function toScreen(x: number, y: number): Point {
  return { x: x * PIXELS_PER_METER, y: CANVAS_HEIGHT - y * PIXELS_PER_METER }
}

/** 화면에 보이는 캔버스 영역(getBoundingClientRect의 필요한 부분). */
export interface DisplayRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 브라우저 클릭 좌표를 캔버스 논리 좌표(1280×720)로 환산한다. CSS로 캔버스를 줄여 보여 줄 때
 * StudioRenderer.actorAt에 넘기기 전에 쓴다(Ruling 31).
 */
export function clientToCanvas(clientX: number, clientY: number, rect: DisplayRect): Point {
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  }
}

/**
 * 카메라 부채꼴의 화면 좌표 꼭짓점을 [x0, y0, x1, y1, ...]로 돌려준다. 첫 점은 카메라 위치.
 * 각도는 도 단위, +x가 0도, 반시계(+y 위)다. 화면은 y가 아래로 늘어나므로 y 성분의 부호를 뒤집는다.
 */
export function cameraFanPoints(
  position: Point,
  angleDegrees: number,
  fovDegrees: number,
  rangeMeters: number,
  arcSteps: number,
): number[] {
  const origin = toScreen(position.x, position.y)
  const range = rangeMeters * PIXELS_PER_METER
  const center = (angleDegrees * Math.PI) / 180
  const half = (fovDegrees * Math.PI) / 360
  const points = [origin.x, origin.y]
  for (let step = 0; step <= arcSteps; step++) {
    const angle = center - half + (2 * half * step) / arcSteps
    points.push(origin.x + Math.cos(angle) * range, origin.y - Math.sin(angle) * range)
  }
  return points
}

/** 캡슐 중심 축의 양 끝점(화면 좌표). angle은 라디안, 반시계(+y 위)다. */
export function capsuleEndpoints(x: number, y: number, angle: number): [Point, Point] {
  const center = toScreen(x, y)
  const half = CAPSULE.halfHeight * PIXELS_PER_METER
  // 물리 좌표에서 위쪽 축 (0, half)을 angle만큼 반시계로 돌리고, 화면에선 y를 뒤집는다.
  const dx = -Math.sin(angle) * half
  const dy = -Math.cos(angle) * half
  return [
    { x: center.x + dx, y: center.y + dy },
    { x: center.x - dx, y: center.y - dy },
  ]
}

/** 캡슐 중심에서 화면 위·아래 끝까지의 거리(px). 누우면 줄어들어 이름표가 몸에 붙는다. */
export function capsuleVerticalExtent(angle: number): number {
  return (Math.abs(Math.cos(angle)) * CAPSULE.halfHeight + CAPSULE.radius) * PIXELS_PER_METER
}

export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lengthSquared = abx * abx + aby * aby
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSquared))
  return Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t))
}

/**
 * 임시(Plan 2 Task 5에서 쿼터뷰로 교체): 몸의 위 방향을 사이드뷰(x-y 평면)의 기울기로 바꾼다.
 * 라디안, 반시계(+y 위). 서 있으면(0, 1, 0) 0이다.
 */
export function sideViewTilt(up: Vec3): number {
  return Math.atan2(-up.x, up.y)
}

/** 임시(Task 5에서 교체): 회전 쿼터니언의 z축 성분 각도(라디안, 반시계)로 사이드뷰 회전을 근사한다. */
export function sideViewRotation(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
}
