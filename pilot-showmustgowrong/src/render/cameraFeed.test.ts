import { describe, expect, it } from 'vitest'
import { AUDIENCE_NOISE_SECONDS, STEP_SECONDS } from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import type { CameraDef } from '@/content/types'
import { Broadcast } from '@/sim/engine'
import type { ActorView, BroadcastInput, EquipmentView } from '@/sim/engineTypes'
import { MIN_DISTANCE, REFERENCE_DISTANCE, cameraFeed, type FeedView } from './cameraFeed'

const CAMERA: CameraDef = {
  id: 'cam',
  label: '카메라',
  position: { x: 0, y: 2, z: 0 },
  defaultAngle: 0,
  fovDegrees: 60,
  range: 20,
  shotIntensity: 1,
}

const AUDIENCE_ZONE = { minX: 10, maxX: 14, minZ: -2, maxZ: 2 }

function actor(id: string, x: number, z: number, overrides: Partial<ActorView> = {}): ActorView {
  return {
    id,
    name: `이름 ${id}`,
    x,
    y: 1,
    z,
    up: { x: 0, y: 1, z: 0 },
    pose: 'idle',
    onAir: true,
    walkedOut: false,
    departed: false,
    directivesLeft: 1,
    tension: 0,
    aboutToBurst: false,
    misfireChance: 0,
    ...overrides,
  }
}

function view(
  actors: ActorView[],
  overrides: Partial<FeedView> = {},
  equipment: EquipmentView[] = [],
): FeedView {
  return {
    actors,
    equipment,
    cameraAngles: { cam: 0 },
    cameraTargets: { cam: null },
    cameraAimModes: { cam: 'fixed' },
    cameraSubjects: {
      cam: [...actors.map((a) => a.id), ...equipment.map((e) => e.id)],
    },
    ...overrides,
  }
}

/** 카메라(0, 0)에서 yaw 방향으로 distance만큼 떨어진 바닥 점 */
function polar(yaw: number, distance: number): { x: number; z: number } {
  const radians = (yaw * Math.PI) / 180
  return { x: Math.cos(radians) * distance, z: Math.sin(radians) * distance }
}

const FAR_ZONE = { minX: -14, maxX: -10, minZ: -2, maxZ: 2 } // 카메라 뒤쪽
const feedOf = (v: FeedView) => cameraFeed(v, CAMERA, FAR_ZONE)
const actorItem = (v: FeedView, id: string) => feedOf(v).find((item) => item.id === id)

describe('screenX', () => {
  it('카메라 정면은 0, 화각 끝은 왼쪽 -1과 오른쪽 1이다', () => {
    const center = polar(0, 10)
    // 위에서 내려다보면 yaw는 +x(0°)에서 +z(90°)로 시계 방향으로 커지므로 카메라의 오른쪽이다.
    const left = polar(-30, 10)
    const right = polar(30, 10)
    const v = view([
      actor('c', center.x, center.z),
      actor('l', left.x, left.z),
      actor('r', right.x, right.z),
    ])
    expect(actorItem(v, 'c')?.screenX).toBeCloseTo(0)
    expect(actorItem(v, 'l')?.screenX).toBeCloseTo(-1)
    expect(actorItem(v, 'r')?.screenX).toBeCloseTo(1)
  })

  it('yaw가 커지는 쪽이 화면 오른쪽이다', () => {
    const point = polar(10, 10)
    expect(actorItem(view([actor('a', point.x, point.z)]), 'a')?.screenX).toBeGreaterThan(0)
  })

  it('무대 와이드 피드의 좌우 순서가 스튜디오 쿼터뷰와 같다(x가 큰 출연자가 오른쪽)', async () => {
    const broadcast = await Broadcast.create({ show: TALK_SHOW, ...LINEUP, seed: 1 })
    try {
      const wide = TALK_SHOW.cameras.find((camera) => camera.id === 'wide')
      if (wide === undefined) throw new Error('wide 카메라가 없습니다')
      const items = cameraFeed(broadcast.view(), wide, TALK_SHOW.audienceZone)
      const xOf = (id: string) => items.find((item) => item.id === id)?.screenX
      expect(xOf('rex')).toBeLessThan(xOf('priya') ?? Number.NaN)
      expect(xOf('priya')).toBeLessThan(xOf('okafor') ?? Number.NaN)
      expect(xOf('okafor')).toBeLessThan(xOf('mo') ?? Number.NaN)
    } finally {
      broadcast.dispose()
    }
  })

  it('카메라의 현재 yaw를 기준으로 한다', () => {
    const point = polar(90, 10)
    const v = view([actor('a', point.x, point.z)], {
      cameraAngles: { cam: 90 },
    })
    expect(actorItem(v, 'a')?.screenX).toBeCloseTo(0)
  })
})

describe('size', () => {
  it('두 배 멀리 있으면 절반이다', () => {
    const near = polar(0, 5)
    const far = polar(0, 10)
    const v = view([actor('near', near.x, near.z), actor('far', far.x, far.z)])
    const nearSize = actorItem(v, 'near')?.size ?? 0
    expect(actorItem(v, 'far')?.size).toBeCloseTo(nearSize / 2)
  })
})

describe('목록', () => {
  it('가까운 것이 뒤에 온다', () => {
    const near = polar(0, 5)
    const far = polar(0, 10)
    const v = view([actor('near', near.x, near.z), actor('far', far.x, far.z)])
    expect(feedOf(v).map((item) => item.id)).toEqual(['far', 'near'])
  })

  it('cameraSubjects에 없는 출연자와 장비는 그리지 않는다', () => {
    const point = polar(0, 5)
    const v = view([actor('hidden', point.x, point.z)], {
      cameraSubjects: { cam: [] },
    })
    expect(feedOf(v)).toEqual([])
  })

  it('이탈한 출연자는 없다', () => {
    const point = polar(0, 5)
    const v = view([actor('gone', point.x, point.z, { departed: true })])
    expect(feedOf(v)).toEqual([])
  })

  it('따라가는 중인 추적 대상만 highlighted다', () => {
    const point = polar(0, 5)
    const other = polar(5, 5)
    const actors = [actor('a', point.x, point.z), actor('b', other.x, other.z)]
    const v = view(actors, { cameraTargets: { cam: 'a' }, cameraAimModes: { cam: 'tracking' } })
    expect(actorItem(v, 'a')?.highlighted).toBe(true)
    expect(actorItem(v, 'b')?.highlighted).toBe(false)
    // 지시로 고정됐거나 스태프가 놀라 있으면 대상이어도 따라가지 않는다
    for (const mode of ['directed', 'startled'] as const) {
      const held = view(actors, { cameraTargets: { cam: 'a' }, cameraAimModes: { cam: mode } })
      expect(actorItem(held, 'a')?.highlighted).toBe(false)
    }
  })

  it('높이 떠 있으면 heightOffset이 커지고 장비도 투영한다', () => {
    const point = polar(0, 10)
    const equipment: EquipmentView = {
      id: 'light',
      kind: 'hangingLight',
      x: point.x,
      y: 6,
      z: point.z,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      released: false,
    }
    const v = view([actor('a', point.x, point.z, { y: 3 })], {}, [equipment])
    const item = actorItem(v, 'a')
    const light = feedOf(v).find((entry) => entry.kind === 'equipment')
    expect(item?.heightOffset).toBeGreaterThan(0)
    expect(light?.heightOffset).toBeGreaterThan(item?.heightOffset ?? 0)
  })

  it('관객석은 엔진이 cameraSubjects에 audience를 담았을 때만 구역 중앙에 그린다', () => {
    const caught = view([], { cameraSubjects: { cam: ['audience'] } })
    const items = cameraFeed(caught, CAMERA, AUDIENCE_ZONE).filter((i) => i.kind === 'audience')
    expect(items).toHaveLength(1)
    expect(items[0].screenX).toBeCloseTo(0)
    // 화각 안이어도 엔진이 담지 않았으면(가림 등) 그리지 않는다
    const missed = cameraFeed(view([]), CAMERA, AUDIENCE_ZONE)
    expect(missed.filter((item) => item.kind === 'audience')).toEqual([])
  })

  it('화각 밖으로 걸친 대상의 screenX는 -1~1로 자른다', () => {
    const outside = polar(45, 10)
    const v = view([actor('wide', outside.x, outside.z)])
    expect(actorItem(v, 'wide')?.screenX).toBe(1)
  })

  it('카메라에 붙은 대상의 size는 MIN_DISTANCE에서 멈춘다', () => {
    const v = view([actor('close', 0.01, 0), actor('min', MIN_DISTANCE, 0)])
    expect(actorItem(v, 'close')?.size).toBe(REFERENCE_DISTANCE / MIN_DISTANCE)
    expect(actorItem(v, 'close')?.size).toBe(actorItem(v, 'min')?.size)
  })

  it('거리가 같으면 입력 순서를 지킨다', () => {
    const a = polar(10, 8)
    const b = polar(-10, 8)
    const v = view([actor('first', a.x, a.z), actor('second', b.x, b.z)])
    expect(feedOf(v).map((item) => item.id)).toEqual(['first', 'second'])
  })

  it('장비 종류를 싣는다', () => {
    const point = polar(0, 10)
    const wall: EquipmentView = {
      id: 'wall',
      kind: 'setWall',
      x: point.x,
      y: 0,
      z: point.z,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      released: false,
    }
    const item = feedOf(view([], {}, [wall])).find((entry) => entry.kind === 'equipment')
    expect(item?.equipmentKind).toBe('setWall')
  })
})

describe('엔진 판정과 일치', () => {
  const NOISE_STEPS = Math.round(AUDIENCE_NOISE_SECONDS / STEP_SECONDS)
  // 와이드(8.5, 9.5)를 175도로 돌리면 관객석 모서리(0~3, 7)는 화각(±40도) 안이고
  // 중앙(1.5, 4)은 밖이다. 예전 피드의 모서리 판정과 엔진 판정이 갈리던 자리다.
  const SHOW = {
    ...TALK_SHOW,
    cameras: TALK_SHOW.cameras.map((entry) =>
      entry.id === 'wide' ? { ...entry, defaultAngle: 175 } : entry,
    ),
  }

  /** 송출 카메라 피드에 관객석이 있는지 */
  function onAirFeedHasAudience(broadcast: Broadcast): boolean {
    const view = broadcast.view()
    const camera = SHOW.cameras.find((entry) => entry.id === view.onAirCameraId)
    if (camera === undefined) throw new Error(`알 수 없는 카메라: ${view.onAirCameraId}`)
    return cameraFeed(view, camera, SHOW.audienceZone).some((item) => item.kind === 'audience')
  }

  it('송출 피드의 관객석 표시는 엔진의 관객석 송출 판정(관객 소음)과 같다', async () => {
    const broadcast = await Broadcast.create({ show: SHOW, ...LINEUP, seed: 3 })
    const audienceNoises = () =>
      broadcast.events().filter((event) => event.sourceId === 'audience' && event.kind === 'noise')
    const aimAudience: BroadcastInput = {
      type: 'directStaff',
      staffId: 'cameraOperator',
      directiveId: 'aimAudience',
    }
    const windows: { inputs: BroadcastInput[]; shown: boolean }[] = [
      { inputs: [{ type: 'switch', cameraId: 'audienceCam' }], shown: true },
      { inputs: [{ type: 'switch', cameraId: 'wide' }], shown: false },
      { inputs: [{ type: 'switch', cameraId: 'close' }, aimAudience], shown: true },
    ]
    try {
      for (const { inputs, shown } of windows) {
        const noisesBefore = audienceNoises().length
        for (let index = 0; index < NOISE_STEPS; index++) {
          broadcast.step(index === 0 ? inputs : [])
          expect(onAirFeedHasAudience(broadcast)).toBe(shown)
        }
        // 관객석이 NOISE_STEPS 동안 송출되면 엔진은 관객 소음을 낸다
        expect(audienceNoises().length > noisesBefore).toBe(shown)
      }
    } finally {
      broadcast.dispose()
    }
  })
})
