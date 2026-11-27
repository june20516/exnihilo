import { placeCard, placeCardInPanel, type BodyBox } from './cardPlacement'

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

describe('카드가 출연자 몸 상자를 덮지 않는다', () => {
  const BODY: BodyBox = { halfWidth: 30, halfHeight: 50 }
  const NARROW = { width: 490, height: 656 }
  const CARD_200 = { width: 300, height: 200 }

  function overlaps(
    placement: { left: number; top: number },
    card: { width: number; height: number },
    anchor: { x: number; y: number },
  ): boolean {
    return (
      placement.left < anchor.x + BODY.halfWidth &&
      placement.left + card.width > anchor.x - BODY.halfWidth &&
      placement.top < anchor.y + BODY.halfHeight &&
      placement.top + card.height > anchor.y - BODY.halfHeight
    )
  }

  it('좁은 패널(약 490폭)의 렉스 자리(오른쪽·왼쪽이 안 맞음)는 아래에 둔다', () => {
    const anchor = { x: 199, y: 288 }
    const placement = placeCard(anchor, CARD_200, NARROW, 12, BODY)
    expect(placement.top).toBe(288 + 50 + 12)
    expect(overlaps(placement, CARD_200, anchor)).toBe(false)
  })

  it('아래도 안 맞으면 위에 둔다', () => {
    const anchor = { x: 199, y: 600 }
    const placement = placeCard(anchor, CARD_200, NARROW, 12, BODY)
    expect(placement.top).toBe(600 - 50 - 12 - 200)
    expect(overlaps(placement, CARD_200, anchor)).toBe(false)
  })

  it('좁은 패널의 모든 앵커에서 패널 안에 있고 몸 상자와 겹치지 않는다(세로가 넉넉할 때)', () => {
    for (const x of [0, 100, 245, 390, 490]) {
      for (const y of [0, 150, 328, 500, 656]) {
        const anchor = { x, y }
        const placement = placeCard(anchor, CARD_200, NARROW, 12, BODY)
        expect(placement.left).toBeGreaterThanOrEqual(0)
        expect(placement.top).toBeGreaterThanOrEqual(0)
        expect(placement.left + CARD_200.width).toBeLessThanOrEqual(NARROW.width)
        expect(placement.top + CARD_200.height).toBeLessThanOrEqual(NARROW.height)
        expect(overlaps(placement, CARD_200, anchor), `앵커 ${x},${y}`).toBe(false)
      }
    }
  })

  it('네 모서리 앵커도 겹치지 않는다', () => {
    const bounds = { width: 800, height: 600 }
    for (const anchor of [
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 0, y: 600 },
      { x: 800, y: 600 },
    ]) {
      const placement = placeCard(anchor, CARD_200, bounds, 12, BODY)
      expect(placement.left).toBeGreaterThanOrEqual(0)
      expect(placement.left + CARD_200.width).toBeLessThanOrEqual(bounds.width)
      expect(placement.top + CARD_200.height).toBeLessThanOrEqual(bounds.height)
      expect(overlaps(placement, CARD_200, anchor), `${anchor.x},${anchor.y}`).toBe(false)
    }
  })

  it('어느 후보도 안 들어가면 겹침이 가장 작은 자리를 쓴다', () => {
    // 카드가 패널을 가득 채우는 경우: 어디에 놓아도 겹친다. 그래도 패널 안에는 둔다
    const bounds = { width: 320, height: 220 }
    const anchor = { x: 160, y: 110 }
    const placement = placeCard(anchor, CARD_200, bounds, 12, BODY)
    expect(placement.left).toBeGreaterThanOrEqual(0)
    expect(placement.left + CARD_200.width).toBeLessThanOrEqual(bounds.width)
    expect(placement.top + CARD_200.height).toBeLessThanOrEqual(bounds.height)
  })

  it('placeCardInPanel의 뷰포트 폴백도 몸 상자를 피한다', () => {
    const origin = { x: 500, y: 100 }
    const panel = { width: 260, height: 146 }
    const anchor = { x: 130, y: 70 }
    const placement = placeCardInPanel(anchor, CARD_200, panel, { width: 1280, height: 720 }, origin, 12, BODY)
    const inViewport = { left: placement.left + origin.x, top: placement.top + origin.y }
    expect(overlaps(inViewport, CARD_200, { x: anchor.x + origin.x, y: anchor.y + origin.y })).toBe(false)
  })

  it('몸 상자가 인자로 들어가 배치를 바꾼다(큰 몸 상자는 같은 앵커에서 카드를 더 멀리 둔다)', () => {
    const anchor = { x: 100, y: 100 }
    const bounds = { width: 800, height: 600 }
    const small = placeCard(anchor, CARD_200, bounds, 12, { halfWidth: 7, halfHeight: 10 })
    const large = placeCard(anchor, CARD_200, bounds, 12, { halfWidth: 30, halfHeight: 50 })
    expect(small.left).toBe(100 + 7 + 12)
    expect(large.left).toBe(100 + 30 + 12)
  })
})
