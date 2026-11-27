import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import {
  IDLE_HEIGHT,
  PERFORMER_IDS,
  cropScaled,
  cutPose,
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

  it('상자 안에 걸친 다른 조각 자리는 투명하게 남긴다', () => {
    // 빨간 L자 요소의 오목한 자리(상자 안)에 닿지 않는 파란 조각이 들어 있다.
    const img = new PNG({ width: 40, height: 40 })
    fillRect(img, 5, 5, 4, 30, RED)
    fillRect(img, 5, 31, 30, 4, RED)
    fillRect(img, 20, 10, 6, 6, [0, 0, 255])
    const boxes = findComponents(img, 0)
    const lShape = boxes.find((b) => b.area === 4 * 30 + 26 * 4)!

    const out = cropScaled(img, lShape, 1)

    // 파란 조각 자리(상자 좌표로 15,5)는 요소 밖이라 알파 0이어야 한다.
    expect(lShape.x).toBe(5)
    expect(lShape.y).toBe(5)
    expect(alphaAt(out, 15, 5)).toBe(0)
    expect(alphaAt(out, 1, 10)).toBeGreaterThan(0)
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

describe('키 맞춤', () => {
  /** idle과 같은 시트의 다른 포즈 요소를 합성한다(투명 바탕 위 사각형). */
  function sheetOf(heights: number[]): PNG {
    const img = new PNG({ width: 400 * heights.length, height: 500 })
    heights.forEach((h, i) => fillRect(img, i * 400 + 10, 10, 100, h, RED))
    return img
  }

  it.each(PERFORMER_IDS)('%s: 출력 idle 높이가 IDLE_HEIGHT와 일치하고 다른 포즈는 같은 배율을 쓴다', (id) => {
    const img = sheetOf([410, 300])
    const [idle, other] = findComponents(img)

    const scale = scaleForTargetHeight(idle, IDLE_HEIGHT[id])

    expect(cutPose(img, idle, scale).height).toBe(IDLE_HEIGHT[id])
    expect(cutPose(img, other, scale).height).toBe(Math.round(300 * scale))
  })

  it('fitWidthPx를 주면 idle 배율 대신 출력 폭을 그 값에 맞춘다', () => {
    const img = sheetOf([400])
    const [box] = findComponents(img)

    const out = cutPose(img, box, 0.5, 40)

    expect(out.width).toBe(40)
    expect(out.height).toBe(160)
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

  it('flood 임계값(232)에 못 미치는 연한 색(200 이상)도 기본 검사에서 센다', () => {
    const img = new PNG({ width: 10, height: 10 })
    fillRect(img, 2, 2, 6, 6, RED)
    setPixel(img, 2, 5, [215, 215, 215])
    setPixel(img, 2, 4, [190, 190, 190]) // 더 진한 색은 세지 않는다

    expect(whiteFringeRatio(img)).toBeCloseTo(1 / 20)
  })
})
