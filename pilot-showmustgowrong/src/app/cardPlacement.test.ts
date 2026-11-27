import { placeCard } from './cardPlacement'

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
