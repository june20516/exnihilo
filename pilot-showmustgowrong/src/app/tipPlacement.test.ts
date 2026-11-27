import { describe, expect, it } from 'vitest'
import { placeTip, TIP_OFFSET, type TipPlacementInput } from './tipPlacement'

/** 1280×720 화면, 왼쪽 위 (100, 50)에 붙은 요소, 220×100 말풍선 */
const BASE: TipPlacementInput = {
  x: 100,
  y: 100,
  width: 220,
  height: 100,
  originLeft: 100,
  originTop: 50,
  viewportWidth: 1280,
  viewportHeight: 720,
}

describe('placeTip', () => {
  it('자리가 있으면 마우스 오른쪽 아래에 둔다', () => {
    expect(placeTip(BASE)).toEqual({ left: 100 + TIP_OFFSET, top: 100 + TIP_OFFSET })
  })

  it('화면 오른쪽 끝을 넘으면 마우스 왼쪽으로 뒤집는다', () => {
    // 화면 x = 1000 + 100 + 14 + 220 = 1334 > 1280
    const position = placeTip({ ...BASE, x: 1000 })
    expect(position.left).toBe(1000 - TIP_OFFSET - 220)
    expect(position.top).toBe(100 + TIP_OFFSET)
  })

  it('화면 아래 끝을 넘으면 마우스 위로 뒤집는다', () => {
    // 화면 y = 600 + 50 + 14 + 100 = 764 > 720
    const position = placeTip({ ...BASE, y: 600 })
    expect(position.top).toBe(600 - TIP_OFFSET - 100)
    expect(position.left).toBe(100 + TIP_OFFSET)
  })

  it('뒤집은 쪽이 화면 왼쪽을 넘으면 화면 안으로 밀어 넣는다', () => {
    // 좁은 화면: 오른쪽은 넘치고(10 + 100 + 14 + 220 > 300), 왼쪽으로 뒤집으면 화면 x = -124
    const position = placeTip({ ...BASE, x: 10, viewportWidth: 300 })
    expect(position.left).toBe(-BASE.originLeft)
  })

  it('뒤집은 쪽이 화면 위를 넘으면 화면 안으로 밀어 넣는다', () => {
    // 낮은 화면: 아래는 넘치고(20 + 50 + 14 + 100 > 150), 위로 뒤집으면 화면 y = -44
    const position = placeTip({ ...BASE, y: 20, viewportHeight: 150 })
    expect(position.top).toBe(-BASE.originTop)
  })

  it('말풍선 전체가 화면 안에 든다(송출 화면 크게의 오른쪽 위 스튜디오 축소판)', () => {
    const input: TipPlacementInput = { ...BASE, x: 200, y: 90, originLeft: 1010, originTop: 54 }
    const { left, top } = placeTip(input)
    expect(input.originLeft + left).toBeGreaterThanOrEqual(0)
    expect(input.originLeft + left + input.width).toBeLessThanOrEqual(input.viewportWidth)
    expect(input.originTop + top + input.height).toBeLessThanOrEqual(input.viewportHeight)
  })
})
