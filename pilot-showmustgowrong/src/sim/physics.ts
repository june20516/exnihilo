import RAPIER from '@dimforge/rapier3d-deterministic-compat'
import {
  ACTOR_FRICTION,
  ACTOR_RESTITUTION,
  BOUNDARY_THICKNESS,
  CAPSULE,
  FLOOR_FRICTION,
  GRAVITY,
  IMPACT_SPEED,
  LIGHT_DENSITY,
  LIGHT_HALF_EXTENTS,
  MASS_DENSITY,
  SET_WALL_DENSITY,
  SET_WALL_HALF_EXTENTS,
  SET_WALL_TOPPLE_ANGVEL,
  SETTLED_SPEED,
  STAND_UP_CLEARANCE,
  STAND_UP_SEARCH_STEP,
  STAND_UP_SECONDS,
  STEP_SECONDS,
  STUDIO_DEPTH,
  STUDIO_HEIGHT,
  STUDIO_WIDTH,
} from '@/content/balance'
import type { EquipmentDef, Intensity, Weight } from '@/content/types'
import { type FloorPoint, floorDistance, type Vec3 } from './vec'

/** 서 있는 캡슐 중심의 높이 */
const STANDING_Y = CAPSULE.halfHeight + CAPSULE.radius
const STAND_UP_STEPS = Math.round(STAND_UP_SECONDS / STEP_SECONDS)
const INTENSITIES_DESCENDING: readonly Intensity[] = [3, 2, 1]
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 }
const ZERO: Vec3 = { x: 0, y: 0, z: 0 }
/** 일어설 빈자리를 찾는 최대 반경(m) */
const STAND_UP_SEARCH_RADIUS = Math.hypot(STUDIO_WIDTH, STUDIO_DEPTH)

let physicsReady = false
let pendingInit: Promise<void> | undefined

/** Rapier wasm을 한 번만 초기화한다. 실패하면 다음 호출에서 다시 시도한다. */
export function initPhysics(): Promise<void> {
  pendingInit ??= RAPIER.init().then(
    () => {
      physicsReady = true
    },
    (error: unknown) => {
      pendingInit = undefined
      throw error
    },
  )
  return pendingInit
}

export interface Contact {
  a: string
  b: string | 'floor'
  intensity: Intensity
  /** 직전 스텝 속력이 더 큰 참여자 id(actor 또는 장비). 같으면 a, 바닥 접촉이면 a. */
  fasterId: string
}

export interface ActorState {
  position: Vec3
  velocity: Vec3
  /** 몸의 위 방향 단위 벡터. 서 있으면 (0, 1, 0). */
  up: Vec3
  tumbling: boolean
  /** 천장을 제외한 무언가(바닥, 다른 actor, 장비, 옆벽)에 받쳐져 있음. 바닥 착지만 뜻하지 않는다. */
  grounded: boolean
}

export interface EquipmentState {
  position: Vec3
  rotation: { x: number; y: number; z: number; w: number }
  released: boolean
}

interface ActorEntry {
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
  tumbling: boolean
  /** 넘어진 채 바닥에서 멈춰 있던 연속 스텝 수 */
  restSteps: number
}

interface EquipmentEntry {
  def: EquipmentDef
  body: RAPIER.RigidBody
  released: boolean
}

/** collider handle로 찾는 접촉 상대. 벽·천장은 접촉을 보고하지 않는다. */
type ColliderOwner =
  | { kind: 'actor'; id: string }
  | { kind: 'equipment'; id: string }
  | { kind: 'floor' }
  | { kind: 'boundary' }

function intensityForSpeed(relativeSpeed: number): Intensity | undefined {
  return INTENSITIES_DESCENDING.find((intensity) => relativeSpeed >= IMPACT_SPEED[intensity])
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clampToStudio(point: FloorPoint): FloorPoint {
  return {
    x: clamp(point.x, CAPSULE.radius, STUDIO_WIDTH - CAPSULE.radius),
    z: clamp(point.z, CAPSULE.radius, STUDIO_DEPTH - CAPSULE.radius),
  }
}

/** 캡슐이 옆벽에 박히지 않고 설 수 있는 바닥 자리(벽에서 캡슐 반경 이상 떨어짐)면 true */
function isStandable(point: FloorPoint): boolean {
  const clamped = clampToStudio(point)
  return clamped.x === point.x && clamped.z === point.z
}

/** 서 있는 actor의 회전을 모두 잠근다. */
function lockRotations(body: RAPIER.RigidBody, wakeUp: boolean): void {
  body.setEnabledRotations(false, false, false, wakeUp)
}

function speedOf(velocity: Vec3): number {
  return Math.hypot(velocity.x, velocity.y, velocity.z)
}

/** 회전 quaternion으로 +y 단위 벡터를 돌린 몸의 위 방향 */
function upFromRotation(q: { x: number; y: number; z: number; w: number }): Vec3 {
  return {
    x: 2 * (q.x * q.y - q.w * q.z),
    y: 1 - 2 * (q.x * q.x + q.z * q.z),
    z: 2 * (q.y * q.z + q.w * q.x),
  }
}

/** center 둘레를 반경 0, STEP, 2·STEP ... 순서로 도는 바닥 평면 후보. 같은 입력이면 같은 순서다. */
function* spiralAround(center: FloorPoint): Generator<FloorPoint> {
  yield center
  for (let radius = STAND_UP_SEARCH_STEP; radius <= STAND_UP_SEARCH_RADIUS; radius += STAND_UP_SEARCH_STEP) {
    const samples = Math.ceil((2 * Math.PI * radius) / STAND_UP_SEARCH_STEP)
    for (let i = 0; i < samples; i += 1) {
      const angle = (2 * Math.PI * i) / samples
      yield { x: center.x + radius * Math.cos(angle), z: center.z + radius * Math.sin(angle) }
    }
  }
}

export class PhysicsWorld {
  private readonly world: RAPIER.World
  private readonly events: RAPIER.EventQueue
  private readonly actors = new Map<string, ActorEntry>()
  private readonly equipment = new Map<string, EquipmentEntry>()
  private readonly owners = new Map<number, ColliderOwner>()
  private readonly ceilingHandle: number
  private disposed = false
  /**
   * 마지막 world.step 뒤에 세운 자리(collider handle → 바닥 위치). 공개 API
   * `propagateModifiedBodyPositionsToColliders()`는 collider 위치만 갱신하고, scene query가 쓰는
   * BVH는 step 밖에서 갱신되지 않는다. 그래서 같은 스텝에 세운 actor끼리는 이 목록으로 피한다.
   */
  private readonly standSpotsSinceStep = new Map<number, FloorPoint>()

  constructor() {
    if (!physicsReady) {
      throw new Error('Rapier가 초기화되지 않았습니다. initPhysics()를 먼저 await하세요.')
    }
    this.events = new RAPIER.EventQueue(true)
    this.world = new RAPIER.World(GRAVITY)
    this.world.timestep = STEP_SECONDS

    const t = BOUNDARY_THICKNESS / 2
    const hw = STUDIO_WIDTH / 2 + BOUNDARY_THICKNESS
    const hd = STUDIO_DEPTH / 2 + BOUNDARY_THICKNESS
    const hh = STUDIO_HEIGHT / 2 + BOUNDARY_THICKNESS
    const cx = STUDIO_WIDTH / 2
    const cy = STUDIO_HEIGHT / 2
    const cz = STUDIO_DEPTH / 2

    const floor = this.addBoundary({ x: cx, y: -t, z: cz }, { hx: hw, hy: t, hz: hd })
    floor.setFriction(FLOOR_FRICTION)
    this.owners.set(floor.handle, { kind: 'floor' })

    const ceiling = this.addBoundary({ x: cx, y: STUDIO_HEIGHT + t, z: cz }, { hx: hw, hy: t, hz: hd })
    this.ceilingHandle = ceiling.handle
    for (const collider of [
      ceiling,
      this.addBoundary({ x: -t, y: cy, z: cz }, { hx: t, hy: hh, hz: hd }),
      this.addBoundary({ x: STUDIO_WIDTH + t, y: cy, z: cz }, { hx: t, hy: hh, hz: hd }),
      this.addBoundary({ x: cx, y: cy, z: -t }, { hx: hw, hy: hh, hz: t }),
      this.addBoundary({ x: cx, y: cy, z: STUDIO_DEPTH + t }, { hx: hw, hy: hh, hz: t }),
    ]) {
      this.owners.set(collider.handle, { kind: 'boundary' })
    }
  }

  /** wasm 메모리(World, EventQueue)를 해제한다. 이후 다른 메서드는 오류를 던진다. 두 번째 호출은 무시한다. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.events.free()
    this.world.free()
    this.actors.clear()
    this.equipment.clear()
    this.owners.clear()
    this.standSpotsSinceStep.clear()
  }

  addActor(id: string, at: FloorPoint, weight: Weight): void {
    this.assertNewId(id)
    const start = clampToStudio(at)
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.x, STANDING_Y, start.z)
        .setCcdEnabled(true)
        .setCanSleep(false),
    )
    lockRotations(body, false)
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(CAPSULE.halfHeight, CAPSULE.radius)
        .setDensity(MASS_DENSITY[weight])
        .setFriction(ACTOR_FRICTION)
        .setRestitution(ACTOR_RESTITUTION)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    )
    this.actors.set(id, { body, collider, tumbling: false, restSteps: 0 })
    this.owners.set(collider.handle, { kind: 'actor', id })
  }

  /** 조명은 공중에 고정(kinematic), 세트 벽은 position에서 바닥(position.y)에 세운 직육면체다. */
  addEquipment(def: EquipmentDef): void {
    this.assertNewId(def.id)
    const isLight = def.kind === 'hangingLight'
    const extents = isLight ? LIGHT_HALF_EXTENTS : SET_WALL_HALF_EXTENTS
    const { x, y, z } = def.position
    const bodyDesc = isLight
      ? RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)
      : RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y + extents.hy, z)
    const body = this.world.createRigidBody(bodyDesc.setCcdEnabled(true).setCanSleep(false))
    if (!isLight) {
      // 풀려나기 전에는 밀리거나 넘어지지 않는다. desc 단계에서 잠그면
      // 나중에 풀어도 움직이지 않아서(Rapier 0.21) 생성 뒤에 잠근다.
      body.setEnabledTranslations(false, false, false, false)
      body.setEnabledRotations(false, false, false, false)
    }
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(extents.hx, extents.hy, extents.hz)
        .setDensity(isLight ? LIGHT_DENSITY : SET_WALL_DENSITY)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    )
    this.equipment.set(def.id, { def, body, released: false })
    this.owners.set(collider.handle, { kind: 'equipment', id: def.id })
  }

  /** 조명은 떨어뜨리고, 세트 벽은 스튜디오 중심 쪽(z)으로 쓰러뜨린다. 두 번째 호출은 무시한다. */
  releaseEquipment(id: string): void {
    this.assertAlive()
    const entry = this.equipment.get(id)
    if (entry === undefined || entry.released) return
    entry.released = true
    const { body, def } = entry
    if (def.kind === 'hangingLight') {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      return
    }
    // x축 둘레 양의 각속도는 윗부분을 +z로 넘긴다. 벽은 x축으로만 회전한다.
    body.setEnabledTranslations(true, true, true, true)
    body.setEnabledRotations(true, false, false, true)
    const towardCenter = def.position.z < STUDIO_DEPTH / 2 ? 1 : -1
    body.setAngvel({ x: towardCenter * SET_WALL_TOPPLE_ANGVEL, y: 0, z: 0 }, true)
  }

  removeActor(id: string): void {
    this.assertAlive()
    const entry = this.actors.get(id)
    if (entry === undefined) return
    this.owners.delete(entry.collider.handle)
    this.standSpotsSinceStep.delete(entry.collider.handle)
    this.world.removeRigidBody(entry.body)
    this.actors.delete(id)
  }

  /** 속도를 직접 정한다. 위로 날리면 회전 잠금을 풀어 넘어질 수 있게 한다. */
  impulse(id: string, velocity: Vec3): void {
    this.assertAlive()
    const entry = this.actors.get(id)
    if (entry === undefined) return
    entry.body.setLinvel(velocity, true)
    if (velocity.y > 0) this.startTumbling(entry)
  }

  /** 바닥에 세워서 옮기고 회전을 잠근다. 자리가 차 있으면 비켜 선다. */
  teleport(id: string, to: FloorPoint): void {
    this.assertAlive()
    const entry = this.actors.get(id)
    if (entry === undefined) return
    this.standUp(entry, to)
  }

  step(): Contact[] {
    this.assertAlive()
    const previous = this.recordVelocities()
    this.world.step(this.events)
    this.standSpotsSinceStep.clear()

    const contacts: Contact[] = []
    this.events.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return
      const contact = this.toContact(handle1, handle2, previous)
      if (contact !== undefined) contacts.push(contact)
    })

    for (const contact of contacts) {
      if (contact.intensity < 2) continue
      for (const id of [contact.a, contact.b]) {
        const entry = this.actors.get(id)
        if (entry !== undefined) this.startTumbling(entry)
      }
    }
    this.standUpSettledActors()
    return contacts
  }

  actorState(id: string): ActorState | undefined {
    this.assertAlive()
    const entry = this.actors.get(id)
    if (entry === undefined) return undefined
    return {
      position: entry.body.translation(),
      velocity: entry.body.linvel(),
      up: upFromRotation(entry.body.rotation()),
      tumbling: entry.tumbling,
      grounded: this.isSupported(entry.collider),
    }
  }

  equipmentState(id: string): EquipmentState | undefined {
    this.assertAlive()
    const entry = this.equipment.get(id)
    if (entry === undefined) return undefined
    return {
      position: entry.body.translation(),
      rotation: entry.body.rotation(),
      released: entry.released,
    }
  }

  /**
   * from에서 to까지 장비가 시선을 가리지 않으면 true. 출연자, 바닥, 벽은 무시한다.
   * 직전 step()에서 갱신된 collider 위치 기준이며, addEquipment/releaseEquipment 직후엔 step 이후에 호출할 것.
   */
  lineOfSight(from: Vec3, to: Vec3): boolean {
    this.assertAlive()
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const length = Math.hypot(dx, dy, dz)
    if (length === 0) return true
    const ray = new RAPIER.Ray(from, { x: dx / length, y: dy / length, z: dz / length })
    const blocked = this.world.castRay(
      ray,
      length,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => this.owners.get(collider.handle)?.kind === 'equipment',
    )
    return blocked === null
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('dispose된 PhysicsWorld입니다.')
  }

  /** actor와 장비는 접촉 보고에서 같은 id 공간을 쓰므로 겹치면 안 된다. */
  private assertNewId(id: string): void {
    this.assertAlive()
    if (this.actors.has(id) || this.equipment.has(id)) {
      throw new Error(`이미 있는 물리 id입니다: ${id}`)
    }
  }

  private addBoundary(
    center: Vec3,
    half: { hx: number; hy: number; hz: number },
  ): RAPIER.Collider {
    return this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.hx, half.hy, half.hz).setTranslation(center.x, center.y, center.z),
    )
  }

  private startTumbling(entry: ActorEntry): void {
    entry.tumbling = true
    entry.restSteps = 0
    entry.body.setEnabledRotations(true, true, true, true)
  }

  private standUp(entry: ActorEntry, at: FloorPoint): void {
    const { body } = entry
    const spot = this.freeStandingSpot(entry.collider, at)
    body.setTranslation({ x: spot.x, y: STANDING_Y, z: spot.z }, true)
    body.setRotation(IDENTITY_ROTATION, true)
    body.setLinvel(ZERO, true)
    body.setAngvel(ZERO, true)
    lockRotations(body, true)
    // collider 위치를 바로 맞춰서 query가 옛 위치의 collider를 장애물로 보지 않게 한다.
    this.world.propagateModifiedBodyPositionsToColliders()
    this.standSpotsSinceStep.set(entry.collider.handle, spot)
    entry.tumbling = false
    entry.restSteps = 0
  }

  /**
   * at에서 가장 가까운, 다른 actor나 장비와 겹치지 않고 설 수 있는 바닥 자리.
   * 겹친 채 세우면 solver가 밀어내며 튕기므로 옆으로 비켜 세운다. 빈 곳이 없으면 at 그대로.
   */
  private freeStandingSpot(self: RAPIER.Collider, at: FloorPoint): FloorPoint {
    const probe = new RAPIER.Capsule(CAPSULE.halfHeight, CAPSULE.radius + STAND_UP_CLEARANCE)
    const isBody = (collider: RAPIER.Collider): boolean => {
      const owner = this.owners.get(collider.handle)
      return owner?.kind === 'actor' || owner?.kind === 'equipment'
    }
    const minGap = 2 * (CAPSULE.radius + STAND_UP_CLEARANCE)
    const newSpots = [...this.standSpotsSinceStep].filter(([handle]) => handle !== self.handle)
    const clearOfNewSpots = (candidate: FloorPoint): boolean =>
      newSpots.every(([, spot]) => floorDistance(spot, candidate) >= minGap)
    const isFree = (candidate: FloorPoint): boolean =>
      clearOfNewSpots(candidate) &&
      this.world.intersectionWithShape(
        { x: candidate.x, y: STANDING_Y, z: candidate.z },
        IDENTITY_ROTATION,
        probe,
        undefined,
        undefined,
        self,
        undefined,
        isBody,
      ) === null

    const start = clampToStudio(at)
    for (const candidate of spiralAround(start)) {
      if (isStandable(candidate) && isFree(candidate)) return candidate
    }
    return start
  }

  /** 넘어진 채 받쳐진 상태로 SETTLED_SPEED 미만이 STAND_UP_SECONDS 이어지면 세운다. */
  private standUpSettledActors(): void {
    for (const entry of this.actors.values()) {
      if (!entry.tumbling) continue
      const settled = speedOf(entry.body.linvel()) < SETTLED_SPEED && this.isSupported(entry.collider)
      entry.restSteps = settled ? entry.restSteps + 1 : 0
      if (entry.restSteps < STAND_UP_STEPS) continue
      const { x, z } = entry.body.translation()
      this.standUp(entry, { x, z })
    }
  }

  /** 천장이 아닌 무언가(바닥, 다른 actor, 장비, 옆벽)에 실제로 닿아 있으면 받쳐진 것으로 본다. */
  private isSupported(collider: RAPIER.Collider): boolean {
    let supported = false
    this.world.contactPairsWith(collider, (other) => {
      if (supported || other.handle === this.ceilingHandle) return
      this.world.contactPair(collider, other, (manifold) => {
        if (manifold.numContacts() > 0) supported = true
      })
    })
    return supported
  }

  /** 동적 body의 직전 스텝 속도. 키는 collider handle이다. */
  private recordVelocities(): Map<number, Vec3> {
    const velocities = new Map<number, Vec3>()
    this.world.forEachCollider((collider) => {
      const body = collider.parent()
      if (body === null || body.isFixed()) return
      velocities.set(collider.handle, body.linvel())
    })
    return velocities
  }

  private toContact(
    handle1: number,
    handle2: number,
    previous: Map<number, Vec3>,
  ): Contact | undefined {
    const owner1 = this.owners.get(handle1)
    const owner2 = this.owners.get(handle2)
    if (owner1 === undefined || owner2 === undefined) return undefined
    if (owner1.kind === 'boundary' || owner2.kind === 'boundary') return undefined

    // actor를 a에 둔다. 바닥은 항상 b다.
    const swap = owner2.kind === 'actor' && owner1.kind !== 'actor'
    const [first, second] = swap ? [owner2, owner1] : [owner1, owner2]
    const [firstHandle, secondHandle] = swap ? [handle2, handle1] : [handle1, handle2]
    if (first.kind === 'floor') return undefined

    const v1 = previous.get(firstHandle) ?? ZERO
    if (second.kind === 'floor') {
      // 바닥 접촉은 actor만 보고하고, actor의 직전 수직 속도 중 내려오는 성분만 상대 속도로 본다
      // (Ruling 24). 수평으로 미끄러지거나 위로 이륙하는 것은 충격이 아니다.
      if (first.kind !== 'actor') return undefined
      const intensity = intensityForSpeed(Math.max(0, -v1.y))
      if (intensity === undefined) return undefined
      return { a: first.id, b: 'floor', intensity, fasterId: first.id }
    }

    const v2 = previous.get(secondHandle) ?? ZERO
    const intensity = intensityForSpeed(speedOf({ x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z }))
    if (intensity === undefined) return undefined
    const fasterId = speedOf(v2) > speedOf(v1) ? second.id : first.id
    return { a: first.id, b: second.id, intensity, fasterId }
  }
}
