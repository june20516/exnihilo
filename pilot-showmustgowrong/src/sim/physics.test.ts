import { STAND_UP_SECONDS, STEP_SECONDS } from '@/content/balance'
import type { EquipmentDef } from '@/content/types'
import { type Contact, initPhysics, PhysicsWorld } from './physics'

const SETTLE_STEPS = 10

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
