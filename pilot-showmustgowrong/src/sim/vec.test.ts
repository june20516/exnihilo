import { distance3, floorDistance, normalizeDegrees, rotateYaw, yawBetween } from './vec'

describe('vec', () => {
  it('yawBetween은 +x를 0도, +z를 90도로 본다', () => {
    expect(yawBetween({ x: 0, z: 0 }, { x: 1, z: 0 })).toBe(0)
    expect(yawBetween({ x: 0, z: 0 }, { x: 0, z: 1 })).toBe(90)
    expect(yawBetween({ x: 0, z: 0 }, { x: -1, z: 0 })).toBe(180)
    expect(yawBetween({ x: 0, z: 0 }, { x: 0, z: -1 })).toBe(-90)
  })

  it('rotateYaw는 짧은 쪽으로 보간한다', () => {
    expect(rotateYaw(170, -170, 0.5)).toBe(180)
    expect(rotateYaw(0, 90, 0.5)).toBe(45)
    expect(rotateYaw(-170, 170, 1)).toBe(170)
  })

  it('normalizeDegrees는 (-180, 180] 범위를 돌려준다', () => {
    expect(normalizeDegrees(-180)).toBe(180)
    expect(normalizeDegrees(180)).toBe(180)
    expect(normalizeDegrees(540)).toBe(180)
    expect(normalizeDegrees(190)).toBe(-170)
    expect(normalizeDegrees(0)).toBe(0)
  })

  it('거리를 잰다', () => {
    expect(floorDistance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5)
    expect(distance3({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 6 })).toBe(7)
  })
})
