import { pointInPolygon, type Point } from './geometry'

export type StudioHit =
  | { kind: 'actor'; id: string }
  | { kind: 'staff'; id: string }
  | { kind: 'equipment'; id: string }
  | { kind: 'phenomenon'; id: number }

/** 출연자 빌보드. center를 중심으로 tilt(Pixi rotation 방향)만큼 기운 사각형이다. */
export interface BillboardHitShape {
  id: string
  center: Point
  tilt: number
  halfWidth: number
  halfHeight: number
  depth: number
}

export interface RectHitShape {
  id: string
  left: number
  top: number
  right: number
  bottom: number
  depth: number
}

/** 장비의 보이는 면들(화면 좌표 다각형) */
export interface PolygonHitShape {
  id: string
  polygons: Point[][]
  depth: number
}

export interface CircleHitShape {
  id: number
  center: Point
  radius: number
  depth: number
}

/** 마지막 draw에서 계산한 클릭 영역. depth는 depthKey(클수록 앞)다. */
export interface HitShapes {
  actors: BillboardHitShape[]
  staff: RectHitShape[]
  equipment: PolygonHitShape[]
  phenomena: CircleHitShape[]
}

/**
 * (화면 좌표) point에 있는 대상을 고른다. 종류 우선순위가 깊이보다 먼저다:
 * 출연자 → 스태프 → 장비 → 현상 순으로 보고, 같은 종류 안에서만 앞쪽(depth가 큰 것)을 고른다.
 * 개입의 주 대상인 출연자는 세트 벽이나 조명에 가려져도 클릭으로 고를 수 있어야 하기 때문이다(R17).
 */
export function pickHit(point: Point, shapes: HitShapes): StudioHit | null {
  const actor = frontmost(shapes.actors.filter((shape) => insideBillboard(point, shape)))
  if (actor !== null) return { kind: 'actor', id: actor.id }
  const staff = frontmost(shapes.staff.filter((shape) => insideRect(point, shape)))
  if (staff !== null) return { kind: 'staff', id: staff.id }
  const equipment = frontmost(
    shapes.equipment.filter((shape) =>
      shape.polygons.some((polygon) => pointInPolygon(point, polygon)),
    ),
  )
  if (equipment !== null) return { kind: 'equipment', id: equipment.id }
  const phenomenon = frontmost(shapes.phenomena.filter((shape) => insideCircle(point, shape)))
  if (phenomenon !== null) return { kind: 'phenomenon', id: phenomenon.id }
  return null
}

/** depth가 가장 큰(가장 앞의) 것. 비어 있으면 null. */
export function frontmost<T extends { depth: number }>(shapes: readonly T[]): T | null {
  let best: T | null = null
  for (const shape of shapes) if (best === null || shape.depth > best.depth) best = shape
  return best
}

/** 기운 빌보드 사각형 안에 점이 있는지. 점을 몸의 로컬 좌표로 되돌려 잰다. */
export function insideBillboard(point: Point, shape: BillboardHitShape): boolean {
  const dx = point.x - shape.center.x
  const dy = point.y - shape.center.y
  const cos = Math.cos(shape.tilt)
  const sin = Math.sin(shape.tilt)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return Math.abs(localX) <= shape.halfWidth && Math.abs(localY) <= shape.halfHeight
}

function insideRect(point: Point, shape: RectHitShape): boolean {
  return (
    point.x >= shape.left &&
    point.x <= shape.right &&
    point.y >= shape.top &&
    point.y <= shape.bottom
  )
}

function insideCircle(point: Point, shape: CircleHitShape): boolean {
  return Math.hypot(point.x - shape.center.x, point.y - shape.center.y) <= shape.radius
}
