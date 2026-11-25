import { CAPSULE, STAND_UP_SECONDS, STEP_SECONDS, STUDIO_DEPTH, STUDIO_HEIGHT, STUDIO_WIDTH } from '@/content/balance'
import { type Contact, type EquipmentDef3, initPhysics, PhysicsWorld } from './physics3d'
import { type FloorPoint, floorDistance } from './vec'

const SETTLE_STEPS = 10
const STANDING_Y = CAPSULE.halfHeight + CAPSULE.radius

const SET_WALL: EquipmentDef3 = {
  id: 'wall',
  name: '무너지는 세트 벽',
  kind: 'setWall',
  position: { x: 13.5, y: 0, z: 6 },
  breakAt: 2,
  onBreak: [],
}

const LIGHT: EquipmentDef3 = {
  id: 'light',
  name: '과열된 조명',
  kind: 'hangingLight',
  position: { x: 8, y: 6, z: 5 },
  breakAt: 2,
  onBreak: [],
}

function stepMany(world: PhysicsWorld, steps: number): Contact[] {
  const contacts: Contact[] = []
  for (let i = 0; i < steps; i += 1) contacts.push(...world.step())
  return contacts
}

function floorOf(world: PhysicsWorld, id: string): FloorPoint {
  const position = world.actorState(id)?.position
  if (position === undefined) throw new Error(`actor 없음: ${id}`)
  return { x: position.x, z: position.z }
}

function speedOf(world: PhysicsWorld, id: string): number {
  const velocity = world.actorState(id)?.velocity
  return Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0, velocity?.z ?? 0)
}

beforeAll(async () => {
  await initPhysics()
})

describe('PhysicsWorld 3D', () => {
  it('서 있는 actor는 60스텝 뒤에도 똑바로 서 있다', () => {
    const world = new PhysicsWorld()
    world.addActor('a', { x: 8, z: 5 }, 'normal')
    stepMany(world, 60)
    const state = world.actorState('a')
    expect(state?.up.x).toBeCloseTo(0, 2)
    expect(state?.up.y).toBeCloseTo(1, 2)
    expect(state?.up.z).toBeCloseTo(0, 2)
    expect(state?.position.y).toBeCloseTo(STANDING_Y, 2)
    expect(state?.grounded).toBe(true)
    expect(state?.tumbling).toBe(false)
  })

  it('impulse로 위로 날리면 넘어지고 z 방향으로 움직인다', () => {
    const world = new PhysicsWorld()
    world.addActor('a', { x: 8, z: 3 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.impulse('a', { x: 0, y: 6, z: 4 })
    expect(world.actorState('a')?.tumbling).toBe(true)
    stepMany(world, 60)
    expect(floorOf(world, 'a').z - 3).toBeGreaterThan(1)
  })

  it('같은 입력이면 300 스텝 뒤 모든 actor 위치가 비트 단위로 같다', () => {
    function run(): unknown[] {
      const world = new PhysicsWorld()
      world.addActor('a', { x: 4, z: 3 }, 'light')
      world.addActor('b', { x: 8, z: 5 }, 'normal')
      world.addActor('c', { x: 12, z: 7 }, 'heavy')
      for (let i = 0; i < 300; i += 1) {
        if (i === 30) world.impulse('a', { x: 6, y: 4, z: 2 })
        if (i === 90) world.impulse('c', { x: -7, y: 0, z: -3 })
        if (i === 150) world.impulse('b', { x: 3, y: 9, z: -2 })
        world.step()
      }
      return ['a', 'b', 'c'].map((id) => {
        const state = world.actorState(id)
        if (state === undefined) throw new Error(`actor 없음: ${id}`)
        return state
      })
    }
    expect(run()).toEqual(run())
  })

  it('상대 속도 6.5m/s로 정면 충돌하면 강도 2 접촉 하나가 나오고 빠른 쪽이 fasterId다', () => {
    const world = new PhysicsWorld()
    world.addActor('left', { x: 7.4, z: 5 }, 'normal')
    world.addActor('right', { x: 8.6, z: 5 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    let firstHit: Contact[] | undefined
    for (let i = 0; i < 60 && firstHit === undefined; i += 1) {
      world.impulse('left', { x: 4.5, y: 0, z: 0 })
      world.impulse('right', { x: -2, y: 0, z: 0 })
      const contacts = world.step()
      if (contacts.length > 0) firstHit = contacts
    }
    expect(firstHit).toEqual([{ a: 'left', b: 'right', intensity: 2, fasterId: 'left' }])
  })

  it('1m/s로 부딪히면 접촉을 돌려주지 않는다', () => {
    const world = new PhysicsWorld()
    world.addActor('left', { x: 7.4, z: 5 }, 'normal')
    world.addActor('right', { x: 8.6, z: 5 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    const contacts: Contact[] = []
    for (let i = 0; i < 60; i += 1) {
      world.impulse('left', { x: 1, y: 0, z: 0 })
      world.impulse('right', { x: -1, y: 0, z: 0 })
      contacts.push(...world.step())
    }
    expect(contacts).toEqual([])
    expect(floorDistance(floorOf(world, 'left'), floorOf(world, 'right'))).toBeLessThan(0.75)
  })

  it('3m 높이에서 떨어진 actor의 바닥 접촉은 내려오는 속도로 강도를 정한다', () => {
    const world = new PhysicsWorld()
    world.addActor('faller', { x: 8, z: 5 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.impulse('faller', { x: 0, y: Math.sqrt(2 * 9.81 * 3), z: 0 })
    const contacts = stepMany(world, 120)
    expect(contacts).toEqual([{ a: 'faller', b: 'floor', intensity: 2, fasterId: 'faller' }])
  })

  it('수평으로 미끄러지며 바닥에 닿으면 접촉을 돌려주지 않는다', () => {
    const world = new PhysicsWorld()
    world.addActor('slider', { x: 3, z: 5 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.impulse('slider', { x: 6, y: 1, z: 6 })
    const contacts = stepMany(world, 30)
    expect(contacts).toEqual([])
  })

  it('날아가 넘어진 actor는 멈춘 뒤 STAND_UP_SECONDS가 지나면 일어선다', () => {
    const world = new PhysicsWorld()
    world.addActor('flyer', { x: 6, z: 5 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.impulse('flyer', { x: 3, y: 6, z: 2 })
    let tilted = false
    let restSteps = 0
    let stoodUp = false
    for (let i = 0; i < 900 && !stoodUp; i += 1) {
      world.step()
      const state = world.actorState('flyer')
      if (state === undefined) throw new Error('actor 없음')
      if (state.up.y < 0.8) tilted = true
      stoodUp = !state.tumbling
      if (!stoodUp) restSteps = state.grounded && speedOf(world, 'flyer') < 0.5 ? restSteps + 1 : 0
    }
    const state = world.actorState('flyer')
    expect(tilted).toBe(true)
    expect(stoodUp).toBe(true)
    expect(restSteps).toBeGreaterThanOrEqual(Math.round(STAND_UP_SECONDS / STEP_SECONDS) - 1)
    expect(state?.up).toEqual({ x: 0, y: 1, z: 0 })
  })

  it('다른 actor가 선 자리로 teleport하면 x 또는 z로 비켜 선다', () => {
    const world = new PhysicsWorld()
    world.addActor('standing', { x: 8, z: 5 }, 'normal')
    world.addActor('mover', { x: 4, z: 5 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.teleport('mover', { x: 8, z: 5 })
    const contacts = stepMany(world, 60)
    expect(contacts).toEqual([])
    expect(floorDistance(floorOf(world, 'mover'), floorOf(world, 'standing'))).toBeGreaterThanOrEqual(
      2 * CAPSULE.radius,
    )
    expect(speedOf(world, 'standing')).toBeLessThan(0.5)
  })

  it('같은 스텝에 두 actor를 같은 자리로 teleport해도 서로 겹치지 않는다', () => {
    const world = new PhysicsWorld()
    world.addActor('first', { x: 2, z: 2 }, 'normal')
    world.addActor('second', { x: 4, z: 2 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.teleport('first', { x: 8, z: 5 })
    world.teleport('second', { x: 8, z: 5 })
    expect(
      floorDistance(floorOf(world, 'first'), floorOf(world, 'second')),
    ).toBeGreaterThanOrEqual(2 * CAPSULE.radius)
  })

  it('넘어진 actor가 일어설 자리에 다른 actor가 있으면 비켜 선다', () => {
    const world = new PhysicsWorld()
    world.addActor('flyer', { x: 6, z: 5 }, 'normal')
    world.addActor('blocker', { x: 6, z: 5.9 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.impulse('flyer', { x: 0, y: 3, z: 0 })
    stepMany(world, 900)
    expect(world.actorState('flyer')?.tumbling).toBe(false)
    expect(floorDistance(floorOf(world, 'flyer'), floorOf(world, 'blocker'))).toBeGreaterThanOrEqual(
      2 * CAPSULE.radius,
    )
  })

  it('releaseEquipment한 조명은 120 스텝 안에 바닥에 닿는다', () => {
    const world = new PhysicsWorld()
    world.addEquipment(LIGHT)
    stepMany(world, 60)
    expect(world.equipmentState('light')).toMatchObject({
      position: { x: 8, y: 6, z: 5 },
      released: false,
    })
    world.releaseEquipment('light')
    stepMany(world, 120)
    const state = world.equipmentState('light')
    expect(state?.released).toBe(true)
    expect(state?.position.y).toBeLessThan(0.5)
  })

  it('풀려난 세트 벽은 스튜디오 중심 쪽 z로 쓰러진다', () => {
    for (const wallZ of [7, 3]) {
      const world = new PhysicsWorld()
      world.addEquipment({ ...SET_WALL, position: { ...SET_WALL.position, z: wallZ } })
      stepMany(world, 60)
      const standing = world.equipmentState('wall')
      expect(standing?.position.z).toBeCloseTo(wallZ, 3)
      world.releaseEquipment('wall')
      stepMany(world, 300)
      const fallen = world.equipmentState('wall')
      if (fallen === undefined) throw new Error('장비 없음')
      const towardCenter = Math.sign(STUDIO_DEPTH / 2 - wallZ)
      expect((fallen.position.z - wallZ) * towardCenter).toBeGreaterThan(1)
      expect(fallen.position.y).toBeGreaterThan(0)
      expect(fallen.position.y).toBeLessThan(0.5)
    }
  })

  it('lineOfSight는 장비만 시선을 가린다', () => {
    const camera = { x: 8, y: 1.5, z: 9.5 }
    const target = { x: 8, y: 0.85, z: 3 }
    const wall: EquipmentDef3 = { ...SET_WALL, position: { x: 8, y: 0, z: 6 } }

    const open = new PhysicsWorld()
    open.addActor('target', { x: 8, z: 3 }, 'normal')
    open.addActor('between', { x: 8, z: 6 }, 'normal')
    stepMany(open, SETTLE_STEPS)
    expect(open.lineOfSight(camera, target)).toBe(true)

    const blocked = new PhysicsWorld()
    blocked.addEquipment(wall)
    blocked.addActor('target', { x: 8, z: 3 }, 'normal')
    stepMany(blocked, SETTLE_STEPS)
    expect(blocked.lineOfSight(camera, target)).toBe(false)
  })

  it('같은 id를 다시 추가하면 오류를 던진다', () => {
    const world = new PhysicsWorld()
    world.addActor('dup', { x: 4, z: 5 }, 'normal')
    world.addEquipment(SET_WALL)
    expect(() => world.addActor('dup', { x: 6, z: 5 }, 'normal')).toThrow(/dup/)
    expect(() => world.addEquipment({ ...SET_WALL, id: 'dup' })).toThrow(/dup/)
    expect(() => world.addActor('wall', { x: 6, z: 5 }, 'normal')).toThrow(/wall/)
  })

  it('바깥으로 세게 날린 actor는 300 스텝 뒤에도 스튜디오 안에 있다', () => {
    const world = new PhysicsWorld()
    const launches = [
      { x: 30, y: 5, z: 0 },
      { x: -30, y: 5, z: 0 },
      { x: 0, y: 5, z: 30 },
      { x: 0, y: 5, z: -30 },
      { x: 0, y: 30, z: 0 },
    ]
    launches.forEach((_, index) =>
      world.addActor(`a${index}`, { x: 2 + index * 3, z: 5 }, 'light'),
    )
    stepMany(world, SETTLE_STEPS)
    launches.forEach((velocity, index) => world.impulse(`a${index}`, velocity))
    for (let i = 0; i < 300; i += 1) {
      world.step()
      launches.forEach((_, index) => {
        const position = world.actorState(`a${index}`)?.position
        expect(position?.x).toBeGreaterThan(0)
        expect(position?.x).toBeLessThan(STUDIO_WIDTH)
        expect(position?.z).toBeGreaterThan(0)
        expect(position?.z).toBeLessThan(STUDIO_DEPTH)
        expect(position?.y).toBeLessThan(STUDIO_HEIGHT)
      })
    }
  })

  it('removeActor 뒤에는 상태가 없고 그 actor의 접촉도 나오지 않는다', () => {
    const world = new PhysicsWorld()
    world.addActor('left', { x: 7.4, z: 5 }, 'normal')
    world.addActor('right', { x: 8.6, z: 5 }, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.removeActor('right')
    expect(world.actorState('right')).toBeUndefined()
    const contacts: Contact[] = []
    for (let i = 0; i < 60; i += 1) {
      world.impulse('left', { x: 6, y: 0, z: 0 })
      contacts.push(...world.step())
    }
    expect(contacts).toEqual([])
  })

  it('releaseEquipment를 두 번 불러도 두 번째는 무시한다', () => {
    const world = new PhysicsWorld()
    world.addEquipment(SET_WALL)
    world.releaseEquipment('wall')
    stepMany(world, 30)
    const before = world.equipmentState('wall')
    world.releaseEquipment('wall')
    world.step()
    const after = world.equipmentState('wall')
    expect(after?.rotation.x).not.toBeCloseTo(0, 5)
    // 각속도가 다시 설정되었다면 회전 진행이 달라진다. 한 스텝 진행량이 이전 속도의 연장선인지 본다.
    const reference = new PhysicsWorld()
    reference.addEquipment(SET_WALL)
    reference.releaseEquipment('wall')
    stepMany(reference, 31)
    expect(after).toEqual(reference.equipmentState('wall'))
    expect(before?.released).toBe(true)
  })

  it('없는 id로 impulse, teleport, removeActor를 불러도 오류 없이 무시한다', () => {
    const world = new PhysicsWorld()
    expect(() => {
      world.impulse('ghost', { x: 1, y: 1, z: 1 })
      world.teleport('ghost', { x: 1, z: 1 })
      world.removeActor('ghost')
      world.releaseEquipment('ghost')
    }).not.toThrow()
  })

  it('dispose 뒤 메서드를 부르면 명시적 오류를 던진다', () => {
    const world = new PhysicsWorld()
    world.addActor('a', { x: 4, z: 5 }, 'normal')
    world.dispose()
    expect(() => world.step()).toThrow(/dispose/)
    expect(() => world.actorState('a')).toThrow(/dispose/)
  })
})

describe('initPhysics', () => {
  afterEach(() => {
    vi.doUnmock('@dimforge/rapier3d-deterministic-compat')
    vi.resetModules()
  })

  it('초기화 전에 월드를 만들면 명시적 오류를 던진다', async () => {
    vi.resetModules()
    const fresh = await import('./physics3d')
    expect(() => new fresh.PhysicsWorld()).toThrow(/initPhysics/)
  })

  it('초기화가 실패하면 다음 호출에서 다시 시도한다', async () => {
    const init = vi.fn<() => Promise<void>>()
    init.mockRejectedValueOnce(new Error('wasm 실패')).mockResolvedValueOnce(undefined)
    vi.resetModules()
    vi.doMock('@dimforge/rapier3d-deterministic-compat', () => ({ default: { init } }))
    const fresh = await import('./physics3d')
    await expect(fresh.initPhysics()).rejects.toThrow('wasm 실패')
    await expect(fresh.initPhysics()).resolves.toBeUndefined()
    expect(init).toHaveBeenCalledTimes(2)
  })
})
