import { placeCard, placeCardInPanel } from './cardPlacement'

const CARD = { width: 300, height: 260 }
const BOUNDS = { width: 470, height: 600 }

describe('placeCard', () => {
  it('오른쪽 우선, 위로 넘치면 0에 붙인다', () => {
    expect(placeCard({ x: 50, y: 100 }, CARD, BOUNDS)).toEqual({ left: 62, top: 0 })
  })

  it('오른쪽이 넘치면 왼쪽에 둔다', () => {
    expect(placeCard({ x: 400, y: 300 }, CARD, BOUNDS).left).toBe(88)
  })

  it('오른쪽 아래 모서리는 안으로 밀어 넣는다', () => {
    expect(placeCard({ x: 460, y: 590 }, CARD, BOUNDS)).toEqual({ left: 148, top: 340 })
  })

  it('카드가 bounds보다 크면 0에 붙인다', () => {
    expect(placeCard({ x: 10, y: 10 }, { width: 600, height: 700 }, BOUNDS)).toEqual({ left: 0, top: 0 })
  })
})

describe('placeCardInPanel', () => {
  const VIEWPORT = { width: 1280, height: 720 }

  it('카드가 패널에 들어가면 패널 안에 놓는다(네 모서리 앵커도 패널 밖으로 나가지 않는다)', () => {
    const origin = { x: 280, y: 60 }
    for (const anchor of [
      { x: 0, y: 0 },
      { x: BOUNDS.width, y: 0 },
      { x: 0, y: BOUNDS.height },
      { x: BOUNDS.width, y: BOUNDS.height },
    ]) {
      const { left, top } = placeCardInPanel(anchor, CARD, BOUNDS, VIEWPORT, origin)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(left + CARD.width).toBeLessThanOrEqual(BOUNDS.width)
      expect(top + CARD.height).toBeLessThanOrEqual(BOUNDS.height)
    }
  })

  it('패널이 카드보다 작으면 화면 안에 들어가게 놓는다', () => {
    // 오른쪽 위 축소판: 패널 260x146이 화면 오른쪽 위(x 1008, y 64)에 있다
    const origin = { x: 1008, y: 64 }
    const panel = { width: 260, height: 146 }
    const { left, top } = placeCardInPanel({ x: 130, y: 70 }, CARD, panel, VIEWPORT, origin)
    expect(origin.x + left).toBeGreaterThanOrEqual(0)
    expect(origin.x + left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width)
    expect(origin.y + top).toBeGreaterThanOrEqual(0)
    expect(origin.y + top + CARD.height).toBeLessThanOrEqual(VIEWPORT.height)
  })
})
