import type { StudioHit } from '@/render/StudioRenderer'
import { aimDropInput, studioClickInput, type StudioClickState } from './studioClick'

const LIVE: StudioClickState = {
  phase: 'live',
  interventionOpen: false,
  activeActorIds: new Set(['rex', 'mo']),
}

const REX: StudioHit = { kind: 'actor', id: 'rex' }

describe('studioClickInput', () => {
  it('개입 밖 방송 중에 출연자나 스태프를 누르면 정보를 고정해 띄운다(클로즈업은 바꾸지 않는다)', () => {
    expect(studioClickInput(REX, LIVE)).toBe('showInfo')
    expect(studioClickInput({ kind: 'staff', id: 'cameraOperator' }, LIVE)).toBe('showInfo')
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

})

describe('aimDropInput', () => {
  it('카메라를 끌어 방송 중인 출연자 위에 놓으면 그 카메라에 track 입력을 보낸다', () => {
    expect(aimDropInput(REX, LIVE, 'close')).toEqual({ type: 'track', cameraId: 'close', actorId: 'rex' })
    // 개입 중에도 공짜 조작이라 받는다.
    expect(aimDropInput(REX, { ...LIVE, interventionOpen: true }, 'close')).toEqual({
      type: 'track',
      cameraId: 'close',
      actorId: 'rex',
    })
  })

  it('빈 곳·장비·스태프·이탈한 출연자 위, 광고 중, 방송이 끝난 뒤에는 아무것도 보내지 않는다', () => {
    expect(aimDropInput(null, LIVE, 'close')).toBeNull()
    expect(aimDropInput({ kind: 'equipment', id: 'setWall' }, LIVE, 'close')).toBeNull()
    expect(aimDropInput({ kind: 'staff', id: 'cameraOperator' }, LIVE, 'close')).toBeNull()
    expect(aimDropInput(REX, { ...LIVE, activeActorIds: new Set(['mo']) }, 'close')).toBeNull()
    expect(aimDropInput(REX, { ...LIVE, phase: 'ad' }, 'close')).toBeNull()
    expect(aimDropInput(REX, { ...LIVE, phase: 'ended' }, 'close')).toBeNull()
  })
})
