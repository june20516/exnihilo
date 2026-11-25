import type { StudioHit } from '@/render/StudioRenderer'
import { studioClickInput, type StudioClickState } from './studioClick'

const LIVE: StudioClickState = {
  phase: 'live',
  interventionOpen: false,
  activeActorIds: new Set(['rex', 'mo']),
  trackingCameraId: 'close',
}

const REX: StudioHit = { kind: 'actor', id: 'rex' }

describe('studioClickInput', () => {
  it('개입 밖 방송 중에 출연자를 누르면 추적 카메라에 track 입력을 보낸다', () => {
    expect(studioClickInput(REX, LIVE)).toEqual({
      type: 'track',
      cameraId: 'close',
      actorId: 'rex',
    })
  })

  it('개입 중에 출연자나 스태프를 누르면 대상을 고른다', () => {
    const open = { ...LIVE, interventionOpen: true }
    expect(studioClickInput(REX, open)).toBe('selectTarget')
    expect(studioClickInput({ kind: 'staff', id: 'cameraOperator' }, open)).toBe('selectTarget')
  })

  it('광고 중에는 입력이 나가지 않는다', () => {
    expect(studioClickInput(REX, { ...LIVE, phase: 'ad' })).toBeNull()
    expect(studioClickInput(REX, { ...LIVE, phase: 'ad', interventionOpen: true })).toBeNull()
  })

  it('방송이 끝난 뒤에는 입력이 나가지 않는다', () => {
    expect(studioClickInput(REX, { ...LIVE, phase: 'ended' })).toBeNull()
  })

  it('이탈한 출연자를 누르면 입력이 나가지 않는다', () => {
    const gone = { ...LIVE, activeActorIds: new Set(['mo']) }
    expect(studioClickInput(REX, gone)).toBeNull()
    expect(studioClickInput(REX, { ...gone, interventionOpen: true })).toBeNull()
  })

  it('빈 곳, 장비, 현상을 누르면 입력이 나가지 않는다', () => {
    expect(studioClickInput(null, LIVE)).toBeNull()
    expect(studioClickInput({ kind: 'equipment', id: 'setWall' }, LIVE)).toBeNull()
    expect(studioClickInput({ kind: 'phenomenon', id: 3 }, LIVE)).toBeNull()
  })

  it('개입 밖에서 스태프를 누르거나 추적 카메라가 없으면 입력이 나가지 않는다', () => {
    expect(studioClickInput({ kind: 'staff', id: 'cameraOperator' }, LIVE)).toBeNull()
    expect(studioClickInput(REX, { ...LIVE, trackingCameraId: null })).toBeNull()
  })
})
