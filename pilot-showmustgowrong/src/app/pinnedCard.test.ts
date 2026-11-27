import type { ActorView } from '@/sim/engineTypes'
import type { HoverAnchor } from './hoverTipContent'
import { livePinnedAnchor } from './pinnedCard'

const ACTOR = { id: 'rex', walkedOut: false } as ActorView
const PINNED: HoverAnchor = { hit: { kind: 'actor', id: 'rex' }, x: 10, y: 20 }

describe('livePinnedAnchor', () => {
  it('개입 밖에서 출연자가 남아 있으면 고정을 그대로 쓴다', () => {
    expect(livePinnedAnchor(PINNED, [ACTOR], false)).toBe(PINNED)
  })

  it('개입이 시작되면 고정이 풀린다', () => {
    expect(livePinnedAnchor(PINNED, [ACTOR], true)).toBeNull()
  })

  it('고정한 출연자가 이탈하면 고정이 풀린다', () => {
    expect(livePinnedAnchor(PINNED, [{ ...ACTOR, walkedOut: true }], false)).toBeNull()
  })

  it('스태프 고정은 출연자 목록과 상관없고 개입 중에는 풀린다', () => {
    const staff: HoverAnchor = { hit: { kind: 'staff', id: 'cameraOperator' }, x: 1, y: 2 }
    expect(livePinnedAnchor(staff, [], false)).toBe(staff)
    expect(livePinnedAnchor(staff, [], true)).toBeNull()
    expect(livePinnedAnchor(null, [ACTOR], false)).toBeNull()
  })
})
