import { STUDIO_DEPTH, STUDIO_WIDTH } from '@/content/balance'
import type { Vec3 } from '@/sim/vec'

/**
 * 쿼터뷰(아이소메트릭) 투영. 화면은 x가 오른쪽, y가 아래다.
 * 물리 +x는 화면 오른쪽 아래, +z(앞)는 왼쪽 아래, +y(위)는 화면 위로 간다.
 */

const COS_30 = Math.cos(Math.PI / 6)
const SIN_30 = Math.sin(Math.PI / 6)

/** fitIso가 화면에 담는 높이(m). 매달린 조명이 보이는 높이까지다. */
export const ISO_VIEW_HEIGHT = 2.5

export interface Point {
  x: number
  y: number
}

export interface IsoTransform {
  /** 1m당 픽셀 수 */
  scale: number
  /** 물리 원점(0, 0, 0)의 화면 위치 */
  originX: number
  originY: number
}

export function projectIso(point: Vec3, transform: IsoTransform): Point {
  const { scale, originX, originY } = transform
  return {
    x: originX + (point.x - point.z) * COS_30 * scale,
    y: originY + (point.x + point.z) * SIN_30 * scale - point.y * scale,
  }
}

/** 그리는 순서의 기준. 클수록 앞이라 나중에 그린다. */
export function depthKey(point: Vec3): number {
  return point.x + point.z
}

/**
 * 스튜디오 바닥 네 모서리와 ISO_VIEW_HEIGHT까지의 상자가 캔버스에 꽉 차게(여백 padding px)
 * 들어가는 transform. 남는 방향은 가운데로 맞춘다.
 */
export function fitIso(canvasWidth: number, canvasHeight: number, padding: number): IsoTransform {
  // scale 1, 원점 (0, 0)으로 투영한 상자의 범위
  const minX = -STUDIO_DEPTH * COS_30
  const maxX = STUDIO_WIDTH * COS_30
  const minY = -ISO_VIEW_HEIGHT
  const maxY = (STUDIO_WIDTH + STUDIO_DEPTH) * SIN_30
  const scale = Math.min(
    (canvasWidth - padding * 2) / (maxX - minX),
    (canvasHeight - padding * 2) / (maxY - minY),
  )
  return {
    scale,
    originX: canvasWidth / 2 - ((minX + maxX) / 2) * scale,
    originY: canvasHeight / 2 - ((minY + maxY) / 2) * scale,
  }
}

/** 화면에 보이는 캔버스 영역(getBoundingClientRect의 필요한 부분). */
export interface DisplayRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 브라우저 클릭 좌표를 캔버스 논리 좌표로 환산한다. CSS로 캔버스를 줄여 보여 줄 때
 * StudioRenderer.hitTest에 넘기기 전에 쓴다(Ruling 31).
 */
export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: DisplayRect,
  canvas: { width: number; height: number },
): Point {
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  }
}

/**
 * 몸의 위 방향(up)을 화면에 투영했을 때 화면 위쪽에서 시계 방향으로 기운 각도(라디안).
 * Pixi의 rotation과 같은 방향이라 그대로 넣으면 된다. 서 있으면 0이다.
 */
export function screenTilt(up: Vec3): number {
  const tip = projectIso(up, { scale: 1, originX: 0, originY: 0 })
  if (Math.hypot(tip.x, tip.y) < 1e-9) return 0
  return Math.atan2(tip.x, -tip.y)
}

/** 반지름 radius(m)의 바닥 원이 화면에서 보이는 타원의 가로·세로 반지름(px). */
export function floorEllipseRadii(radius: number, scale: number): { rx: number; ry: number } {
  return {
    rx: Math.SQRT2 * COS_30 * radius * scale,
    ry: Math.SQRT2 * SIN_30 * radius * scale,
  }
}

/**
 * 카메라 시야를 바닥 부채꼴로 그릴 꼭짓점(물리 좌표, y=0). 첫 점은 카메라 바로 아래 바닥이다.
 * yaw는 도 단위, +x가 0도, +z가 90도다. range는 바닥 위 수평 거리(m)다.
 */
export function cameraFanFloorPoints(
  position: Vec3,
  yawDegrees: number,
  fovDegrees: number,
  range: number,
  arcSteps: number,
): Vec3[] {
  const center = (yawDegrees * Math.PI) / 180
  const half = (fovDegrees * Math.PI) / 360
  const points: Vec3[] = [{ x: position.x, y: 0, z: position.z }]
  for (let step = 0; step <= arcSteps; step++) {
    const angle = center - half + (2 * half * step) / arcSteps
    points.push({
      x: position.x + Math.cos(angle) * range,
      y: 0,
      z: position.z + Math.sin(angle) * range,
    })
  }
  return points
}

/** 짝수-홀수 규칙으로 점이 다각형 안에 있는지 본다. */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a.y > point.y !== b.y > point.y
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export interface Quaternion {
  x: number
  y: number
  z: number
  w: number
}

/** 쿼터니언으로 벡터를 돌린다. */
export function rotateByQuaternion(vector: Vec3, q: Quaternion): Vec3 {
  // v' = v + w·t + q × t, t = 2(q × v)
  const tx = 2 * (q.y * vector.z - q.z * vector.y)
  const ty = 2 * (q.z * vector.x - q.x * vector.z)
  const tz = 2 * (q.x * vector.y - q.y * vector.x)
  return {
    x: vector.x + q.w * tx + (q.y * tz - q.z * ty),
    y: vector.y + q.w * ty + (q.z * tx - q.x * tz),
    z: vector.z + q.w * tz + (q.x * ty - q.y * tx),
  }
}

/** 보는 사람 쪽 방향. 투영하면 한 점으로 겹치는 방향이며, 이 방향과 내적이 양수인 면이 보인다. */
const VIEWER_DIRECTION: Vec3 = { x: 1, y: 1, z: 1 }

export interface BoxFace {
  /** 화면 좌표 꼭짓점 4개 */
  corners: Point[]
  /** 면의 바깥 법선(물리 좌표) */
  normal: Vec3
}

/**
 * 중심 center, 반 크기 half, 회전 rotation인 직육면체에서 보이는 면들을 화면 좌표로 돌려준다.
 * 볼록한 상자라 보이는 면끼리는 겹치지 않으므로 순서 없이 그려도 된다.
 */
export function visibleBoxFaces(
  center: Vec3,
  half: { hx: number; hy: number; hz: number },
  rotation: Quaternion,
  transform: IsoTransform,
): BoxFace[] {
  const axes = [
    { axis: rotateByQuaternion({ x: 1, y: 0, z: 0 }, rotation), extent: half.hx },
    { axis: rotateByQuaternion({ x: 0, y: 1, z: 0 }, rotation), extent: half.hy },
    { axis: rotateByQuaternion({ x: 0, y: 0, z: 1 }, rotation), extent: half.hz },
  ]
  const corners2d: Array<[number, number]> = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ]
  const faces: BoxFace[] = []
  for (let index = 0; index < axes.length; index++) {
    const normalAxis = axes[index]
    const u = axes[(index + 1) % 3]
    const v = axes[(index + 2) % 3]
    for (const sign of [1, -1]) {
      const normal = scaleVec(normalAxis.axis, sign)
      if (dot(normal, VIEWER_DIRECTION) <= 0) continue
      const faceCenter = addVec(center, scaleVec(normal, normalAxis.extent))
      const corners = corners2d.map(([su, sv]) =>
        projectIso(
          addVec(
            addVec(faceCenter, scaleVec(u.axis, su * u.extent)),
            scaleVec(v.axis, sv * v.extent),
          ),
          transform,
        ),
      )
      faces.push({ corners, normal })
    }
  }
  return faces
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function scaleVec(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}
