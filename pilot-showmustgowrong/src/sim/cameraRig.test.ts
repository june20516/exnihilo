import { describe, expect, it } from 'vitest'
import type { CameraDef, StaffDef } from '@/content/types'
import { CameraRig, chooseTrackTarget } from './cameraRig'
import { type FloorPoint, normalizeDegrees, yawBetween } from './vec'

const CLOSE: CameraDef = {
  id: 'close',
  label: '클로즈업',
  position: { x: 3.5, y: 1.5, z: 9.5 },
  defaultAngle: -80,
  fovDegrees: 24,
  range: 8,
  shotIntensity: 2,
  tracking: true,
}

const SIDE: CameraDef = {
  id: 'side',
  label: '옆',
  position: { x: 0, y: 1, z: 0 },
  defaultAngle: 30,
  fovDegrees: 40,
  range: 8,
  shotIntensity: 1,
}

const staffOn = (cameraId: string, recovery?: StaffDef['recovery']): StaffDef => ({
  id: 'op',
  name: '카메라 감독',
  shortName: '감독',
  cameraId,
  reactions: [],
  directives: [],
  ...(recovery && { recovery }),
})

const nowhere = (): FloorPoint | null => null

function runSteps(
  rig: CameraRig,
  steps: number,
  positionOf: (actorId: string) => FloorPoint | null = nowhere,
): void {
  for (let i = 0; i < steps; i++) rig.update(positionOf)
}

const modeOf = (rig: CameraRig) => rig.staffViews()[0].mode
const progressOf = (rig: CameraRig) => rig.staffViews()[0].recoveryProgress

describe('CameraRig 추적', () => {
  it('추적 카메라는 대상이 움직이면 대상 쪽을 본다', () => {
    const rig = new CameraRig([CLOSE, SIDE], [])
    rig.setTarget('close', 'rex')
    let rex: FloorPoint = { x: 4, z: 4 }
    rig.update((id) => (id === 'rex' ? rex : null))
    expect(rig.angle('close')).toBeCloseTo(yawBetween(CLOSE.position, rex), 3)

    rex = { x: 10, z: 4 }
    rig.update((id) => (id === 'rex' ? rex : null))
    expect(rig.angle('close')).toBeCloseTo(yawBetween(CLOSE.position, rex), 3)
    expect(rig.target('close')).toBe('rex')
    expect(rig.angle('side')).toBe(30)
  })

  it('대상이 없거나 위치를 모르면 기본 방향이고, 추적 카메라가 아니면 대상을 정할 수 없다', () => {
    const rig = new CameraRig([CLOSE, SIDE], [])
    rig.update(nowhere)
    expect(rig.target('close')).toBeNull()
    expect(rig.angle('close')).toBe(-80)
    expect(rig.target('side')).toBeNull()
    expect(() => rig.setTarget('side', 'rex')).toThrow('추적 카메라가 아닙니다')
  })
})

describe('CameraRig 놀람과 복구', () => {
  it('놀란 방향을 1.5초(90스텝) 유지한 뒤 복귀를 시작한다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side')])
    rig.panic('op', 123)
    expect(rig.angle('side')).toBe(123)
    expect(modeOf(rig)).toBe('startled')

    runSteps(rig, 89)
    expect(rig.angle('side')).toBe(123)
    expect(modeOf(rig)).toBe('startled')

    runSteps(rig, 1)
    expect(modeOf(rig)).toBe('recovering')
    runSteps(rig, 1)
    expect(rig.angle('side')).not.toBe(123)
  })

  it('2초(120스텝)에 걸쳐 기준 방향으로 돌아오고, 중간에는 그 사이에 있다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side')])
    rig.panic('op', 123)
    runSteps(rig, 150)
    const middle = rig.angle('side')
    expect(middle).toBeGreaterThan(30)
    expect(middle).toBeLessThan(123)
    expect(modeOf(rig)).toBe('recovering')

    runSteps(rig, 60)
    expect(rig.angle('side')).toBe(30)
    expect(modeOf(rig)).toBe('normal')
  })

  it('복귀 중에 다시 놀라면 타이머가 처음부터 다시 돈다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side')])
    rig.panic('op', 123)
    runSteps(rig, 150)
    rig.panic('op', 10)
    expect(rig.angle('side')).toBe(10)
    expect(modeOf(rig)).toBe('startled')
    expect(progressOf(rig)).toBe(0)

    runSteps(rig, 209)
    expect(modeOf(rig)).toBe('recovering')
    runSteps(rig, 1)
    expect(rig.angle('side')).toBe(30)
    expect(modeOf(rig)).toBe('normal')
  })

  it('침착하라는 지시는 유지 중에도 즉시 기준 방향으로 돌린다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side')])
    rig.panic('op', 123)
    runSteps(rig, 10)
    rig.direct('op', { kind: 'default' })
    expect(rig.angle('side')).toBe(30)
    expect(modeOf(rig)).toBe('normal')
  })

  it('지시한 방향이 있으면 놀람이 끝난 뒤 기본 방향이 아니라 그 방향으로 돌아온다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side')])
    rig.direct('op', { kind: 'yaw', yaw: 200 })
    expect(rig.angle('side')).toBe(normalizeDegrees(200))
    rig.panic('op', 123)
    runSteps(rig, 210)
    expect(rig.angle('side')).toBeCloseTo(normalizeDegrees(200), 6)
    expect(modeOf(rig)).toBe('normal')

    rig.direct('op', { kind: 'default' })
    expect(rig.angle('side')).toBe(30)
  })

  it('스태프별 recovery로 유지와 복귀 시간을 덮어쓴다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side', { holdSeconds: 0.5, returnSeconds: 1 })])
    rig.panic('op', 123)
    runSteps(rig, 29)
    expect(modeOf(rig)).toBe('startled')
    runSteps(rig, 60)
    expect(modeOf(rig)).toBe('recovering')
    runSteps(rig, 1)
    expect(rig.angle('side')).toBe(30)
    expect(modeOf(rig)).toBe('normal')
  })

  it('recoveryProgress는 놀란 순간 0, 105스텝에 0.5, 210스텝에 1이다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side')])
    expect(progressOf(rig)).toBe(1)
    rig.panic('op', 123)
    expect(progressOf(rig)).toBe(0)
    runSteps(rig, 105)
    expect(progressOf(rig)).toBeCloseTo(0.5, 6)
    runSteps(rig, 105)
    expect(progressOf(rig)).toBe(1)
  })

  it('추적 카메라의 복귀 목표는 움직이는 대상을 따라간다', () => {
    const rig = new CameraRig([CLOSE], [staffOn('close')])
    rig.setTarget('close', 'rex')
    let rex: FloorPoint = { x: 4, z: 4 }
    const positionOf = (id: string) => (id === 'rex' ? rex : null)
    rig.update(positionOf)
    rig.panic('op', 123)
    runSteps(rig, 150, positionOf)
    rex = { x: 10, z: 4 }
    runSteps(rig, 60, positionOf)
    expect(rig.angle('close')).toBeCloseTo(yawBetween(CLOSE.position, rex), 6)
  })

  it('staffViews는 스태프 id, 카메라, mode, recoveryProgress를 준다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side')])
    expect(rig.staffViews()).toEqual([
      { id: 'op', cameraId: 'side', mode: 'normal', recoveryProgress: 1 },
    ])
  })

  it('알 수 없는 카메라를 맡은 스태프나 한 카메라를 맡은 두 스태프는 거부한다', () => {
    expect(() => new CameraRig([SIDE], [staffOn('ghost')])).toThrow('알 수 없는 카메라')
    expect(
      () => new CameraRig([SIDE], [staffOn('side'), { ...staffOn('side'), id: 'op2' }]),
    ).toThrow('이미 다른 스태프')
  })
})

describe('chooseTrackTarget', () => {
  const def = (id: string, presence: 1 | 2 | 3, tags: string[] = []) => ({ id, presence, tags })

  it('시작 태그를 가진 첫 출연자를 고른다', () => {
    expect(chooseTrackTarget([def('a', 3), def('b', 1, ['host'])], 'host')).toBe('b')
  })

  it('태그를 가진 출연자가 없으면 존재감이 가장 높은 출연자, 같으면 먼저 오른 출연자', () => {
    expect(chooseTrackTarget([def('a', 2), def('b', 3), def('c', 3)], 'host')).toBe('b')
  })

  it('아무도 없으면 null', () => {
    expect(chooseTrackTarget([], 'host')).toBeNull()
  })
})

describe('CameraRig 대상 재선택과 복구 완료', () => {
  const def = (id: string, presence: 1 | 2 | 3, tags: string[] = []) => ({ id, presence, tags })

  it('retarget은 대상이 없거나 active에 없을 때만 다시 고르고, 추적 카메라만 대상을 갖는다', () => {
    const rig = new CameraRig([CLOSE, SIDE], [])
    rig.retarget([def('rex', 1, ['host']), def('mo', 3)], 'host')
    expect(rig.targets()).toEqual({ close: 'rex', side: null })
    rig.setTarget('close', 'mo')
    rig.retarget([def('rex', 1, ['host']), def('mo', 3)], 'host')
    expect(rig.target('close')).toBe('mo')
    rig.retarget([def('rex', 1, ['host'])], 'host')
    expect(rig.target('close')).toBe('rex')
    rig.retarget([], 'host')
    expect(rig.target('close')).toBeNull()
  })

  it('settledStaffIds는 복귀를 마친 update에서만 스태프 id를 준다', () => {
    const rig = new CameraRig([SIDE], [staffOn('side')])
    rig.panic('op', 123)
    runSteps(rig, 209)
    expect(rig.settledStaffIds()).toEqual([])
    runSteps(rig, 1)
    expect(rig.settledStaffIds()).toEqual(['op'])
    runSteps(rig, 1)
    expect(rig.settledStaffIds()).toEqual([])

    rig.panic('op', 123)
    rig.direct('op', { kind: 'default' })
    runSteps(rig, 1)
    expect(rig.settledStaffIds()).toEqual([])
    expect(rig.angles()).toEqual({ side: 30 })
  })
})
