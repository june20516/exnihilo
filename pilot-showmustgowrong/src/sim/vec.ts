export interface Vec3 {
  x: number
  y: number
  z: number
}

/** 바닥 평면(x, z) 위의 점 */
export interface FloorPoint {
  x: number
  z: number
}

export function floorDistance(a: FloorPoint, b: FloorPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** 각도를 (-180, 180] 범위로 정규화한다. */
export function normalizeDegrees(degrees: number): number {
  const wrapped = (((degrees + 180) % 360) + 360) % 360
  return wrapped === 0 ? 180 : wrapped - 180
}

/** from에서 to를 바라보는 방향(도). +x가 0도, +z가 90도. */
export function yawBetween(from: FloorPoint, to: FloorPoint): number {
  return normalizeDegrees((Math.atan2(to.z - from.z, to.x - from.x) * 180) / Math.PI)
}

/** from에서 to까지 짧은 쪽으로 보간한다. t는 0~1. */
export function rotateYaw(from: number, to: number, t: number): number {
  return normalizeDegrees(from + normalizeDegrees(to - from) * t)
}
