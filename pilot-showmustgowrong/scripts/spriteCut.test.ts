import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import {
  cropScaled,
  findComponents,
  floodClearBackground,
  scaleForTargetHeight,
  whiteFringeRatio,
} from './spriteCut'

type Rgb = readonly [number, number, number]
const WHITE: Rgb = [255, 255, 255]
const RED: Rgb = [200, 30, 30]

/** 지정 색으로 채운 불투명 이미지를 만든다. */
function solidImage(width: number, height: number, color: Rgb): PNG {
  const img = new PNG({ width, height })
  fillRect(img, 0, 0, width, height, color)
  return img
}

function fillRect(img: PNG, x: number, y: number, w: number, h: number, color: Rgb): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(img, xx, yy, color)
  }
}

function setPixel(img: PNG, x: number, y: number, color: Rgb): void {
  const i = (y * img.width + x) * 4
  img.data[i] = color[0]
  img.data[i + 1] = color[1]
  img.data[i + 2] = color[2]
  img.data[i + 3] = 255
}

function alphaAt(img: PNG, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3]
}

describe('floodClearBackground', () => {
  it('가장자리와 이어진 흰 영역(232 이상)만 투명이 된다. 인물 안쪽의 흰 셔츠는 남는다', () => {
    const img = solidImage(20, 20, WHITE)
    // 빨간 테두리(링) 안에 흰 셔츠가 갇혀 있다.
    fillRect(img, 5, 5, 10, 10, RED)
    fillRect(img, 8, 8, 4, 4, WHITE)

    const cleared = floodClearBackground(img)

    expect(alphaAt(cleared, 0, 0)).toBe(0)
    expect(alphaAt(cleared, 19, 19)).toBe(0)
    expect(alphaAt(cleared, 6, 6)).toBe(255)
    expect(alphaAt(cleared, 9, 9)).toBe(255)
  })

  it('임계값 미만의 밝은 회색은 배경으로 보지 않는다', () => {
    const img = solidImage(10, 10, [231, 231, 231])
    expect(alphaAt(floodClearBackground(img), 0, 0)).toBe(255)
    expect(alphaAt(floodClearBackground(img, 230), 0, 0)).toBe(0)
  })

  it('원본 이미지를 바꾸지 않는다', () => {
    const img = solidImage(4, 4, WHITE)
    floodClearBackground(img)
    expect(alphaAt(img, 0, 0)).toBe(255)
  })
})

describe('findComponents', () => {
  /** 투명 바탕에 사각형 요소를 올린 이미지. */
  function sheetWith(rects: ReadonlyArray<[number, number, number, number]>): PNG {
    const img = new PNG({ width: 100, height: 100 })
    for (const [x, y, w, h] of rects) fillRect(img, x, y, w, h, RED)
    return img
  }

  it('연결 요소를 찾아 경계 상자를 행 우선(위→아래, 왼→오른) 순서로 돌려준다', () => {
    // 일부러 뒤섞인 순서로 그린다. 윗줄 2개(오른쪽이 약간 위), 아랫줄 1개.
    const img = sheetWith([
      [60, 8, 20, 30],
      [10, 12, 20, 30],
      [30, 60, 20, 30],
    ])

    const boxes = findComponents(img)

    expect(boxes.map((b) => [b.x, b.y, b.width, b.height])).toEqual([
      [10, 12, 20, 30],
      [60, 8, 20, 30],
      [30, 60, 20, 30],
    ])
  })

  it('면적이 가장 큰 요소의 2% 미만인 조각은 버린다', () => {
    // 큰 요소 40x40=1600, 작은 조각 5x5=25(1.6%), 경계선상 6x6=36(2.25%).
    const img = sheetWith([
      [10, 10, 40, 40],
      [70, 10, 5, 5],
      [70, 60, 6, 6],
    ])

    const boxes = findComponents(img, 0.02)

    expect(boxes).toHaveLength(2)
    expect(boxes.map((b) => b.area)).toEqual([1600, 36])
  })

  it('떨어진 조각은 서로 다른 요소이고 닿은 조각은 하나다', () => {
    const img = sheetWith([
      [10, 10, 20, 20],
      [30, 30, 20, 20], // 대각선으로만 닿음(8방향 연결)
      [70, 70, 20, 20],
    ])
    expect(findComponents(img)).toHaveLength(2)
  })
})

describe('cropScaled', () => {
  it('요소에 속한 픽셀만 남기고 배율대로 크기를 바꾼다', () => {
    const img = new PNG({ width: 100, height: 100 })
    fillRect(img, 10, 10, 20, 40, RED)
    fillRect(img, 32, 60, 6, 6, [0, 0, 255]) // 다른 줄의 별도 조각
    const [box] = findComponents(img, 0)

    const out = cropScaled(img, box, 0.5)

    expect(out.width).toBe(10)
    expect(out.height).toBe(20)
    expect(alphaAt(out, 5, 10)).toBe(255)
  })

  it('경계 1px을 블렌딩해 투명과 맞닿은 불투명 픽셀의 알파가 낮아진다', () => {
    const img = new PNG({ width: 30, height: 30 })
    fillRect(img, 5, 5, 20, 20, RED)
    const [box] = findComponents(img)

    const out = cropScaled(img, box, 1)

    expect(alphaAt(out, 0, 10)).toBeLessThan(255) // 가장자리
    expect(alphaAt(out, 0, 10)).toBeGreaterThan(0)
    expect(alphaAt(out, 10, 10)).toBe(255) // 안쪽
  })
})

describe('scaleForTargetHeight', () => {
  it('기준 포즈(idle) 높이를 targetHeight로 맞춘 배율을 같은 출연자 모든 포즈에 쓴다', () => {
    const idle = { x: 0, y: 0, width: 80, height: 400, area: 1, pixels: new Int32Array() }
    const fallen = { x: 0, y: 0, width: 300, height: 160, area: 1, pixels: new Int32Array() }

    const scale = scaleForTargetHeight(idle, 256)

    expect(scale).toBeCloseTo(0.64)
    expect(Math.round(idle.height * scale)).toBe(256)
    expect(Math.round(fallen.height * scale)).toBe(102)
  })
})

describe('whiteFringeRatio', () => {
  it('투명과 맞닿은 불투명 픽셀 중 거의 흰색인 비율을 돌려준다', () => {
    const img = new PNG({ width: 10, height: 10 })
    fillRect(img, 2, 2, 6, 6, RED)
    // 테두리 한 칸을 흰색으로 바꾼다. 경계 픽셀은 6*4-4=20개.
    setPixel(img, 2, 5, WHITE)

    expect(whiteFringeRatio(img)).toBeCloseTo(1 / 20)
  })
})
