import { describe, expect, it } from 'vitest'
import {
  frontmost,
  insideBillboard,
  pickHit,
  type BillboardHitShape,
  type HitShapes,
  type PolygonHitShape,
} from './hitTest'

const EMPTY: HitShapes = { actors: [], staff: [], equipment: [], phenomena: [] }

function billboard(id: string, x: number, y: number, depth: number, tilt = 0): BillboardHitShape {
  return { id, center: { x, y }, tilt, halfWidth: 10, halfHeight: 30, depth }
}

function square(
  id: string,
  left: number,
  top: number,
  size: number,
  depth: number,
): PolygonHitShape {
  return {
    id,
    polygons: [
      [
        { x: left, y: top },
        { x: left + size, y: top },
        { x: left + size, y: top + size },
        { x: left, y: top + size },
      ],
    ],
    depth,
  }
}

describe('insideBillboard', () => {
  it('서 있으면 세로로 긴 사각형이다', () => {
    const shape = billboard('a', 100, 100, 0)
    expect(insideBillboard({ x: 100, y: 125 }, shape)).toBe(true)
    expect(insideBillboard({ x: 125, y: 100 }, shape)).toBe(false)
  })

  it('90도로 누우면 가로로 긴 사각형이 된다', () => {
    const shape = billboard('a', 100, 100, 0, Math.PI / 2)
    expect(insideBillboard({ x: 125, y: 100 }, shape)).toBe(true)
    expect(insideBillboard({ x: 100, y: 125 }, shape)).toBe(false)
  })
})

describe('frontmost', () => {
  it('depth가 가장 큰 것을 고르고 비어 있으면 null이다', () => {
    expect(frontmost([{ depth: 1 }, { depth: 5 }, { depth: 3 }])).toEqual({ depth: 5 })
    expect(frontmost([])).toBeNull()
  })
})

describe('pickHit', () => {
  it('아무것도 없으면 null이다', () => {
    expect(pickHit({ x: 0, y: 0 }, EMPTY)).toBeNull()
  })

  it('같은 종류가 겹치면 앞쪽(depth가 큰 것)이 잡힌다', () => {
    const shapes: HitShapes = {
      ...EMPTY,
      actors: [billboard('front', 105, 100, 12), billboard('back', 100, 100, 8)],
    }
    expect(pickHit({ x: 102, y: 100 }, shapes)).toEqual({ kind: 'actor', id: 'front' })
  })

  it('출연자와 장비가 겹치면 장비가 앞에 있어도 출연자가 잡힌다', () => {
    const shapes: HitShapes = {
      ...EMPTY,
      actors: [billboard('rex', 100, 100, 8)],
      equipment: [square('wall', 50, 50, 100, 20)],
    }
    expect(pickHit({ x: 100, y: 100 }, shapes)).toEqual({ kind: 'actor', id: 'rex' })
    expect(pickHit({ x: 140, y: 60 }, shapes)).toEqual({ kind: 'equipment', id: 'wall' })
  })

  it('스태프는 장비보다, 장비는 현상보다 먼저다', () => {
    const shapes: HitShapes = {
      actors: [],
      staff: [{ id: 'op', left: 90, top: 90, right: 110, bottom: 110, depth: 1 }],
      equipment: [square('light', 80, 80, 60, 30)],
      phenomena: [{ id: 7, center: { x: 130, y: 130 }, radius: 14, depth: 40 }],
    }
    expect(pickHit({ x: 100, y: 100 }, shapes)).toEqual({ kind: 'staff', id: 'op' })
    expect(pickHit({ x: 130, y: 130 }, shapes)).toEqual({ kind: 'equipment', id: 'light' })
    expect(pickHit({ x: 142, y: 135 }, shapes)).toEqual({ kind: 'phenomenon', id: 7 })
  })
})
