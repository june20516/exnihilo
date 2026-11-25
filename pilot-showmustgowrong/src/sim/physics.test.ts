import { CAPSULE, STAND_UP_SECONDS, STEP_SECONDS } from '@/content/balance'
import type { EquipmentDef } from '@/content/types'
import { type Contact, initPhysics, PhysicsWorld } from './physics'

const SETTLE_STEPS = 10

const SET_WALL: EquipmentDef = {
  id: 'wall',
  name: '무너지는 세트 벽',
  kind: 'setWall',
  position: { x: 13.5, y: 0 },
  breakAt: 2,
  onBreak: [],
}

function stepMany(world: PhysicsWorld, steps: number): Contact[] {
  const contacts: Contact[] = []
  for (let i = 0; i < steps; i += 1) contacts.push(...world.step())
  return contacts
}

/** 두 actor를 매 스텝 같은 속도로 마주 달리게 하고 돌려받은 접촉을 모두 모은다. */
function runToward(world: PhysicsWorld, speed: number, steps: number): Contact[][] {
  const perStep: Contact[][] = []
  for (let i = 0; i < steps; i += 1) {
    world.impulse('left', speed, 0)
    world.impulse('right', -speed, 0)
    perStep.push(world.step())
  }
  return perStep
}

function makeFacingPair(): PhysicsWorld {
  const world = new PhysicsWorld()
  world.addActor('left', 7.4, 'normal')
  world.addActor('right', 8.6, 'normal')
  stepMany(world, SETTLE_STEPS)
  return world
}

beforeAll(async () => {
  await initPhysics()
})

describe('PhysicsWorld', () => {
  it('같은 입력이면 600 스텝 뒤 모든 actor 상태가 같다', () => {
    function run(): unknown[] {
      const world = new PhysicsWorld()
      world.addActor('a', 4, 'light')
      world.addActor('b', 8, 'normal')
      world.addActor('c', 12, 'heavy')
      for (let i = 0; i < 600; i += 1) {
        if (i === 30) world.impulse('a', 6, 4)
        if (i === 90) world.impulse('c', -7, 0)
        if (i === 200) world.impulse('b', 3, 9)
        world.step()
      }
      return ['a', 'b', 'c'].map((id) => world.actorState(id))
    }
    expect(run()).toEqual(run())
  })

  it('각각 4m/s로 마주 달린 두 actor가 부딪히면 강도 2 접촉 하나를 돌려준다', () => {
    const world = makeFacingPair()
    const firstHit = runToward(world, 4, 60).find((contacts) => contacts.length > 0)
    expect(firstHit).toEqual([{ a: 'left', b: 'right', intensity: 2, fasterId: 'left' }])
    expect(world.actorState('left')?.tumbling).toBe(true)
    expect(world.actorState('right')?.tumbling).toBe(true)
  })

  it('1m/s로 부딪히면 접촉을 돌려주지 않는다', () => {
    const world = makeFacingPair()
    const contacts = runToward(world, 1, 60).flat()
    const left = world.actorState('left')
    const right = world.actorState('right')
    expect(contacts).toEqual([])
    // 실제로 맞닿았는지 확인한다(캡슐 지름 0.7m).
    expect((right?.x ?? 0) - (left?.x ?? 0)).toBeLessThan(0.75)
  })

  it('수평으로 빠르게 미끄러지며 바닥에 닿으면 접촉을 돌려주지 않는다', () => {
    const world = new PhysicsWorld()
    world.addActor('slider', 3, 'normal')
    stepMany(world, SETTLE_STEPS)
    // 살짝 떠서 다시 닿는다: 착지 속력은 8m/s 이상이지만 수직 속력은 3m/s 미만이다.
    world.impulse('slider', 8, 1)
    const contacts = stepMany(world, 30)
    expect(world.actorState('slider')?.grounded).toBe(true)
    expect(contacts).toEqual([])
  })

  it('위로 세게 날린 actor는 천장과 벽 안에 머문다', () => {
    const world = new PhysicsWorld()
    world.addActor('up', 8, 'light')
    world.addActor('side', 14, 'light')
    stepMany(world, SETTLE_STEPS)
    world.impulse('up', 0, 20)
    world.impulse('side', 20, 20)
    for (let i = 0; i < 300; i += 1) {
      world.step()
      for (const id of ['up', 'side']) {
        const state = world.actorState(id)
        expect(state?.y).toBeLessThan(9)
        expect(state?.x).toBeGreaterThan(0)
        expect(state?.x).toBeLessThan(16)
      }
    }
  })

  it('날아가 넘어진 actor는 멈춘 뒤 STAND_UP_SECONDS가 지나면 일어선다', () => {
    const world = new PhysicsWorld()
    world.addActor('flyer', 6, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.impulse('flyer', 4, 6)
    expect(world.actorState('flyer')?.tumbling).toBe(true)

    let rotated = false
    let restSteps = 0
    let stoodUp = false
    for (let i = 0; i < 900 && !stoodUp; i += 1) {
      world.step()
      const state = world.actorState('flyer')
      if (state === undefined) throw new Error('actor 없음')
      if (Math.abs(state.angle) > 0.5) rotated = true
      stoodUp = !state.tumbling
      if (!stoodUp) {
        const settled = state.grounded && Math.hypot(state.vx, state.vy) < 0.5
        restSteps = settled ? restSteps + 1 : 0
      }
    }
    const state = world.actorState('flyer')
    expect(rotated).toBe(true)
    expect(stoodUp).toBe(true)
    // 일어서기 직전까지 STAND_UP_SECONDS 가까이 정지해 있었다(일어선 스텝은 세지 않는다).
    expect(restSteps).toBeGreaterThanOrEqual(Math.round(STAND_UP_SECONDS / STEP_SECONDS) - 1)
    expect(state?.tumbling).toBe(false)
    expect(state?.angle).toBe(0)
  })

  it('넘어진 세트 벽은 바닥을 뚫지 않고 눕는다', () => {
    const world = new PhysicsWorld()
    world.addEquipment(SET_WALL)
    stepMany(world, 60)
    expect(world.equipmentState('wall')).toMatchObject({ angle: 0, released: false })
    world.releaseEquipment('wall')
    stepMany(world, 300)
    const state = world.equipmentState('wall')
    if (state === undefined) throw new Error('장비 없음')
    // 반시계로 누웠다(x 13.5라 가운데 쪽인 -x로 넘어짐).
    expect(state.angle).toBeGreaterThan(1.3)
    expect(state.x).toBeLessThan(SET_WALL.position.x)
    expect(state.y).toBeGreaterThan(0)
    expect(state.y).toBeLessThan(0.5)
  })

  it('다른 actor와 겹친 자리로 세워도 튀지 않고 접촉도 없다', () => {
    const world = new PhysicsWorld()
    world.addActor('standing', 8, 'normal')
    world.addActor('mover', 4, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.teleport('mover', 8)
    const contacts: Contact[] = []
    for (let i = 0; i < 60; i += 1) {
      contacts.push(...world.step())
      for (const id of ['standing', 'mover']) {
        const state = world.actorState(id)
        expect(Math.hypot(state?.vx ?? 0, state?.vy ?? 0)).toBeLessThan(0.5)
      }
    }
    expect(contacts).toEqual([])
    const gap = Math.abs((world.actorState('mover')?.x ?? 0) - (world.actorState('standing')?.x ?? 0))
    expect(gap).toBeGreaterThanOrEqual(2 * CAPSULE.radius)
  })

  it('같은 스텝에 두 actor를 같은 x로 연속 teleport해도 서로 겹치지 않는다', () => {
    const world = new PhysicsWorld()
    world.addActor('first', 2, 'normal')
    world.addActor('second', 4, 'normal')
    stepMany(world, SETTLE_STEPS)
    world.teleport('first', 8)
    world.teleport('second', 8)
    const gap = Math.abs((world.actorState('first')?.x ?? 0) - (world.actorState('second')?.x ?? 0))
    expect(gap).toBeGreaterThanOrEqual(2 * CAPSULE.radius)
  })

  it('누운 세트 벽 자리로 세우면 벽과 겹치지 않는 곳에 선다', () => {
    const world = new PhysicsWorld()
    world.addEquipment(SET_WALL)
    world.addActor('mover', 4, 'normal')
    world.releaseEquipment('wall')
    stepMany(world, 300)
    world.teleport('mover', 12)
    for (let i = 0; i < 60; i += 1) {
      expect(world.step()).toEqual([])
      const state = world.actorState('mover')
      expect(Math.hypot(state?.vx ?? 0, state?.vy ?? 0)).toBeLessThan(0.5)
    }
    expect(world.actorState('mover')?.y).toBeCloseTo(CAPSULE.halfHeight + CAPSULE.radius, 2)
  })

  it('같은 id를 다시 추가하면 오류를 던진다', () => {
    const world = new PhysicsWorld()
    world.addActor('dup', 4, 'normal')
    world.addEquipment(SET_WALL)
    expect(() => world.addActor('dup', 6, 'normal')).toThrow(/dup/)
    expect(() => world.addEquipment({ ...SET_WALL, id: 'dup' })).toThrow(/dup/)
    expect(() => world.addActor('wall', 6, 'normal')).toThrow(/wall/)
  })

  it('dispose 뒤 메서드를 부르면 명시적 오류를 던진다', () => {
    const world = new PhysicsWorld()
    world.addActor('a', 4, 'normal')
    world.dispose()
    expect(() => world.step()).toThrow(/dispose/)
    expect(() => world.actorState('a')).toThrow(/dispose/)
    expect(() => world.addActor('b', 6, 'normal')).toThrow(/dispose/)
  })

  it('releaseEquipment한 조명은 300 스텝 뒤 바닥 근처에 있다', () => {
    const light: EquipmentDef = {
      id: 'light',
      name: '과열된 조명',
      kind: 'hangingLight',
      position: { x: 8, y: 6 },
      breakAt: 2,
      onBreak: [],
    }
    const world = new PhysicsWorld()
    world.addEquipment(light)
    stepMany(world, 60)
    expect(world.equipmentState('light')).toMatchObject({ x: 8, y: 6, released: false })
    world.releaseEquipment('light')
    stepMany(world, 300)
    const state = world.equipmentState('light')
    expect(state?.released).toBe(true)
    expect(state?.y).toBeLessThan(1)
  })
})

describe('initPhysics', () => {
  afterEach(() => {
    vi.doUnmock('@dimforge/rapier2d-deterministic-compat')
    vi.resetModules()
  })

  it('초기화 전에 월드를 만들면 명시적 오류를 던진다', async () => {
    vi.resetModules()
    const fresh = await import('./physics')
    expect(() => new fresh.PhysicsWorld()).toThrow(/initPhysics/)
  })

  it('초기화가 실패하면 다음 호출에서 다시 시도한다', async () => {
    const init = vi.fn<() => Promise<void>>()
    init.mockRejectedValueOnce(new Error('wasm 실패')).mockResolvedValueOnce(undefined)
    vi.resetModules()
    vi.doMock('@dimforge/rapier2d-deterministic-compat', () => ({ default: { init } }))
    const fresh = await import('./physics')
    await expect(fresh.initPhysics()).rejects.toThrow('wasm 실패')
    await expect(fresh.initPhysics()).resolves.toBeUndefined()
    expect(init).toHaveBeenCalledTimes(2)
  })
})
