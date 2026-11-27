import { describe, expect, it } from 'vitest'
import { STUDIO_DEPTH, STUDIO_WIDTH } from '@/content/balance'
import { BACKDROP_KINDS } from '@/content/types'
import type { Vec3 } from '@/sim/vec'
import {
  FEED_BACKDROPS,
  FEED_BACKDROP_SOURCE,
  STUDIO_PLANES,
  STUDIO_WALL_HEIGHT,
  coverRect,
  crowdDots,
  feedBackdropLayout,
  planeMatrix,
  type AffineMatrix,
} from './backdrop'
import { ISO_VIEW_HEIGHT, fitIso, projectIso, type Point } from './geometry'

const PIXEL_TOLERANCE = 0.5

function applyMatrix(matrix: AffineMatrix, u: number, v: number): Point {
  return {
    x: matrix.a * u + matrix.c * v + matrix.tx,
    y: matrix.b * u + matrix.d * v + matrix.ty,
  }
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

describe('coverRect', () => {
  it('비율이 같으면 캔버스와 꼭 맞는다', () => {
    expect(coverRect(688, 384, { width: 1376, height: 768 })).toEqual({
      x: 0,
      y: 0,
      width: 688,
      height: 384,
    })
  })

  it('캔버스가 더 세로로 길면 높이를 맞추고 좌우를 가운데에서 잘라 낸다', () => {
    const rect = coverRect(600, 600, { width: 1376, height: 768 })
    expect(rect.height).toBeCloseTo(600)
    expect(rect.width).toBeCloseTo((1376 * 600) / 768)
    expect(rect.y).toBeCloseTo(0)
    expect(rect.x + rect.width / 2).toBeCloseTo(300)
  })

  it('캔버스가 더 가로로 길면 폭을 맞추고 위아래를 가운데에서 잘라 낸다', () => {
    const rect = coverRect(1000, 300, { width: 1376, height: 768 })
    expect(rect.width).toBeCloseTo(1000)
    expect(rect.x).toBeCloseTo(0)
    expect(rect.y + rect.height / 2).toBeCloseTo(150)
    expect(rect.height).toBeGreaterThan(300)
  })
})

describe('FEED_BACKDROPS', () => {
  it('모든 배경 종류에 값이 있고 선 순서가 맞다(수평선 < 발 기준선, 관객 영역 위 < 아래)', () => {
    for (const kind of BACKDROP_KINDS) {
      const spec = FEED_BACKDROPS[kind]
      expect(spec.horizon, kind).toBeLessThan(spec.foot)
      expect(spec.crowdTop, kind).toBeLessThan(spec.crowdBottom)
      expect(spec.foot, kind).toBeLessThanOrEqual(1)
    }
  })

  it('무대 그림은 출연자 발이 벽 아래선보다 아래(바닥 위)에 온다', () => {
    expect(FEED_BACKDROPS.stage.horizon).toBeCloseTo(0.615, 2)
    expect(FEED_BACKDROPS.stage.foot).toBeGreaterThan(FEED_BACKDROPS.stage.horizon)
  })

  it('관객석 그림의 관객 영역은 좌석 영역(39%~75%)이다', () => {
    expect(FEED_BACKDROPS.audience.crowdTop).toBeCloseTo(0.39, 2)
    expect(FEED_BACKDROPS.audience.crowdBottom).toBeCloseTo(0.75, 2)
  })
})

describe('feedBackdropLayout', () => {
  it('선 위치는 그림이 캔버스에 놓인 자리를 따른다(cover로 잘려도 그림과 맞는다)', () => {
    const layout = feedBackdropLayout('stage', 1000, 300)
    const image = coverRect(1000, 300, FEED_BACKDROP_SOURCE)
    expect(layout.image).toEqual(image)
    expect(layout.horizonY).toBeCloseTo(image.y + image.height * FEED_BACKDROPS.stage.horizon)
    expect(layout.footY).toBeCloseTo(image.y + image.height * FEED_BACKDROPS.stage.foot)
  })
})

describe('crowdDots', () => {
  const sizes = [0.5, 0.91, 1.5, 3]
  const feeds = [
    { width: 472, height: 265 },
    { width: 84, height: 47 },
    { width: 700, height: 600 },
  ]
  for (const kind of BACKDROP_KINDS) {
    it(`${kind} 배경에서 관객 점은 크기와 캔버스에 관계없이 관객 영역 안에 든다`, () => {
      for (const feed of feeds) {
        const layout = feedBackdropLayout(kind, feed.width, feed.height)
        for (const size of sizes) {
          const crowd = crowdDots(feed.width / 2, size, feed.width, layout)
          expect(crowd.dots.length).toBeGreaterThan(0)
          for (const dot of crowd.dots) {
            expect(dot.y - crowd.radius).toBeGreaterThanOrEqual(layout.crowdTop - 1e-9)
            expect(dot.y + crowd.radius).toBeLessThanOrEqual(layout.crowdBottom + 1e-9)
          }
          expect(crowd.top).toBeLessThanOrEqual(Math.min(...crowd.dots.map((dot) => dot.y)))
        }
      }
    })
  }
})

describe('planeMatrix', () => {
  const transforms = [
    fitIso(960, 540, 16),
    fitIso(300, 200, 8),
    { scale: 13, originX: -4, originY: 77 },
  ]
  const textures = [
    { width: 1228, height: 768 },
    { width: 1376, height: 215 },
    { width: 64, height: 32 },
  ]

  it('벽 높이는 렌더러가 담는 높이와 같다', () => {
    expect(STUDIO_WALL_HEIGHT).toBe(ISO_VIEW_HEIGHT)
  })

  it('바닥은 x 0~16, z 0~10을 덮고 그림 왼쪽(u=0)이 x=0(관객석 쪽)이다', () => {
    const { origin, u, v } = STUDIO_PLANES.floor
    expect(origin).toEqual({ x: 0, y: 0, z: 0 })
    expect(u).toEqual({ x: STUDIO_WIDTH, y: 0, z: 0 })
    expect(v).toEqual({ x: 0, y: 0, z: STUDIO_DEPTH })
  })

  for (const [name, plane] of Object.entries(STUDIO_PLANES)) {
    it(`${name} 면의 네 모서리가 월드→화면 투영과 같은 점으로 간다`, () => {
      for (const transform of transforms) {
        for (const texture of textures) {
          const matrix = planeMatrix(plane, texture.width, texture.height, transform)
          const cases: Array<[number, number, Vec3]> = [
            [0, 0, plane.origin],
            [texture.width, 0, add(plane.origin, plane.u)],
            [texture.width, texture.height, add(add(plane.origin, plane.u), plane.v)],
            [0, texture.height, add(plane.origin, plane.v)],
          ]
          for (const [u, v, world] of cases) {
            const actual = applyMatrix(matrix, u, v)
            const expected = projectIso(world, transform)
            expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(PIXEL_TOLERANCE)
            expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(PIXEL_TOLERANCE)
          }
        }
      }
    })
  }

  it('뒷벽은 z=0 면, 옆벽은 x=0 면이고 둘 다 그림 위쪽이 벽 꼭대기다', () => {
    const { backWall, sideWall } = STUDIO_PLANES
    for (const corner of [backWall.origin, add(backWall.origin, backWall.u)]) {
      expect(corner.z).toBe(0)
    }
    for (const corner of [sideWall.origin, add(sideWall.origin, sideWall.u)]) {
      expect(corner.x).toBe(0)
    }
    expect(backWall.origin.y).toBe(STUDIO_WALL_HEIGHT)
    expect(sideWall.origin.y).toBe(STUDIO_WALL_HEIGHT)
    expect(backWall.v).toEqual({ x: 0, y: -STUDIO_WALL_HEIGHT, z: 0 })
    expect(sideWall.v).toEqual({ x: 0, y: -STUDIO_WALL_HEIGHT, z: 0 })
  })
})
