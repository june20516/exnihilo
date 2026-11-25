import RAPIER from '@dimforge/rapier2d-deterministic-compat'
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
  STAND_UP_SECONDS,
  STEP_SECONDS,
  STUDIO_HEIGHT,
  STUDIO_WIDTH,
} from '@/content/balance'
import type { EquipmentDef, Intensity, Weight } from '@/content/types'

/** 서 있는 캡슐 중심의 높이 */
const STANDING_Y = CAPSULE.halfHeight + CAPSULE.radius
const STAND_UP_STEPS = Math.round(STAND_UP_SECONDS / STEP_SECONDS)
const INTENSITIES_DESCENDING: readonly Intensity[] = [3, 2, 1]

let initialized: Promise<void> | undefined

/** Rapier wasm을 한 번만 초기화한다. */
export function initPhysics(): Promise<void> {
  initialized ??= RAPIER.init()
  return initialized
}

export interface Contact {
  a: string
  b: string | 'floor'
  intensity: Intensity
  /** 직전 스텝 속력이 더 큰 참여자 id(actor 또는 장비). 같으면 a, 바닥 접촉이면 a. */
  fasterId: string
}

export interface ActorState {
  x: number
  y: number
  angle: number
  vx: number
  vy: number
  tumbling: boolean
  grounded: boolean
}

export interface EquipmentState {
  x: number
  y: number
  angle: number
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

interface Velocity {
  vx: number
  vy: number
}

function intensityForSpeed(relativeSpeed: number): Intensity | undefined {
  return INTENSITIES_DESCENDING.find((intensity) => relativeSpeed >= IMPACT_SPEED[intensity])
}

function clampToStudio(x: number): number {
  return Math.min(Math.max(x, CAPSULE.radius), STUDIO_WIDTH - CAPSULE.radius)
}

export class PhysicsWorld {
  private readonly world: RAPIER.World
  private readonly events = new RAPIER.EventQueue(true)
  private readonly actors = new Map<string, ActorEntry>()
  private readonly equipment = new Map<string, EquipmentEntry>()
  private readonly owners = new Map<number, ColliderOwner>()
  private readonly ceilingHandle: number

  constructor() {
    this.world = new RAPIER.World(GRAVITY)
    this.world.timestep = STEP_SECONDS

    const halfThickness = BOUNDARY_THICKNESS / 2
    const halfWidth = STUDIO_WIDTH / 2 + BOUNDARY_THICKNESS
    const halfHeight = STUDIO_HEIGHT / 2 + BOUNDARY_THICKNESS

    const floor = this.addBoundary(STUDIO_WIDTH / 2, -halfThickness, halfWidth, halfThickness)
    floor.setFriction(FLOOR_FRICTION)
    this.owners.set(floor.handle, { kind: 'floor' })

    const ceiling = this.addBoundary(STUDIO_WIDTH / 2, STUDIO_HEIGHT + halfThickness, halfWidth, halfThickness)
    this.ceilingHandle = ceiling.handle
    for (const collider of [
      ceiling,
      this.addBoundary(-halfThickness, STUDIO_HEIGHT / 2, halfThickness, halfHeight),
      this.addBoundary(STUDIO_WIDTH + halfThickness, STUDIO_HEIGHT / 2, halfThickness, halfHeight),
    ]) {
      this.owners.set(collider.handle, { kind: 'boundary' })
    }
  }

  addActor(id: string, x: number, weight: Weight): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(clampToStudio(x), STANDING_Y)
        .lockRotations()
        .setCcdEnabled(true)
        .setCanSleep(false),
    )
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

  /** 조명은 공중에 고정(kinematic), 세트 벽은 position.x에서 바닥(position.y)에 세운 직육면체다. */
  addEquipment(def: EquipmentDef): void {
    const isLight = def.kind === 'hangingLight'
    const extents = isLight ? LIGHT_HALF_EXTENTS : SET_WALL_HALF_EXTENTS
    const bodyDesc = isLight
      ? RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(def.position.x, def.position.y)
      : RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(def.position.x, def.position.y + extents.hy)
          // 풀려나기 전에는 밀리거나 넘어지지 않는다.
          .lockRotations()
          .lockTranslations()
    const body = this.world.createRigidBody(bodyDesc.setCcdEnabled(true).setCanSleep(false))
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(extents.hx, extents.hy)
        .setDensity(isLight ? LIGHT_DENSITY : SET_WALL_DENSITY)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    )
    this.equipment.set(def.id, { def, body, released: false })
    this.owners.set(collider.handle, { kind: 'equipment', id: def.id })
  }

  /** 조명은 떨어뜨리고, 세트 벽은 스튜디오 가운데 쪽으로 쓰러뜨린다. 두 번째 호출은 무시한다. */
  releaseEquipment(id: string): void {
    const entry = this.equipment.get(id)
    if (entry === undefined || entry.released) return
    entry.released = true
    const { body, def } = entry
    if (def.kind === 'hangingLight') {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      return
    }
    body.lockTranslations(false, true)
    body.lockRotations(false, true)
    // 양의 각속도는 반시계 방향이라 윗부분이 -x로 넘어간다.
    const towardCenter = def.position.x > STUDIO_WIDTH / 2 ? 1 : -1
    body.setAngvel(towardCenter * SET_WALL_TOPPLE_ANGVEL, true)
  }

  removeActor(id: string): void {
    const entry = this.actors.get(id)
    if (entry === undefined) return
    this.owners.delete(entry.collider.handle)
    this.world.removeRigidBody(entry.body)
    this.actors.delete(id)
  }

  /** 속도를 직접 정한다. 위로 날리면 회전 잠금을 풀어 넘어질 수 있게 한다. */
  impulse(id: string, vx: number, vy: number): void {
    const entry = this.actors.get(id)
    if (entry === undefined) return
    entry.body.setLinvel({ x: vx, y: vy }, true)
    if (vy > 0) this.startTumbling(entry)
  }

  /** 바닥에 세워서 x로 옮기고 회전을 잠근다. */
  teleport(id: string, x: number): void {
    const entry = this.actors.get(id)
    if (entry === undefined) return
    this.standUp(entry, x)
  }

  step(): Contact[] {
    const previous = this.recordVelocities()
    this.world.step(this.events)

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
    const entry = this.actors.get(id)
    if (entry === undefined) return undefined
    const position = entry.body.translation()
    const velocity = entry.body.linvel()
    return {
      x: position.x,
      y: position.y,
      angle: entry.body.rotation(),
      vx: velocity.x,
      vy: velocity.y,
      tumbling: entry.tumbling,
      grounded: this.isSupported(entry.collider),
    }
  }

  equipmentState(id: string): EquipmentState | undefined {
    const entry = this.equipment.get(id)
    if (entry === undefined) return undefined
    const position = entry.body.translation()
    return { x: position.x, y: position.y, angle: entry.body.rotation(), released: entry.released }
  }

  private addBoundary(x: number, y: number, hx: number, hy: number): RAPIER.Collider {
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy).setTranslation(x, y))
  }

  private startTumbling(entry: ActorEntry): void {
    entry.tumbling = true
    entry.restSteps = 0
    entry.body.lockRotations(false, true)
  }

  private standUp(entry: ActorEntry, x: number): void {
    const { body } = entry
    body.setTranslation({ x: clampToStudio(x), y: STANDING_Y }, true)
    body.setRotation(0, true)
    body.setLinvel({ x: 0, y: 0 }, true)
    body.setAngvel(0, true)
    body.lockRotations(true, true)
    entry.tumbling = false
    entry.restSteps = 0
  }

  /** 넘어진 채 받쳐진 상태로 SETTLED_SPEED 미만이 STAND_UP_SECONDS 이어지면 세운다. */
  private standUpSettledActors(): void {
    for (const entry of this.actors.values()) {
      if (!entry.tumbling) continue
      const velocity = entry.body.linvel()
      const settled =
        Math.hypot(velocity.x, velocity.y) < SETTLED_SPEED && this.isSupported(entry.collider)
      entry.restSteps = settled ? entry.restSteps + 1 : 0
      if (entry.restSteps >= STAND_UP_STEPS) this.standUp(entry, entry.body.translation().x)
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
  private recordVelocities(): Map<number, Velocity> {
    const velocities = new Map<number, Velocity>()
    this.world.forEachCollider((collider) => {
      const body = collider.parent()
      if (body === null || body.isFixed()) return
      const velocity = body.linvel()
      velocities.set(collider.handle, { vx: velocity.x, vy: velocity.y })
    })
    return velocities
  }

  private toContact(
    handle1: number,
    handle2: number,
    previous: Map<number, Velocity>,
  ): Contact | undefined {
    const owner1 = this.owners.get(handle1)
    const owner2 = this.owners.get(handle2)
    if (owner1 === undefined || owner2 === undefined) return undefined
    if (owner1.kind === 'boundary' || owner2.kind === 'boundary') return undefined
    if (owner1.kind === 'floor' && owner2.kind === 'floor') return undefined

    // actor를 a에 둔다. 바닥은 항상 b다.
    const swap = owner2.kind === 'actor' && owner1.kind !== 'actor'
    const [first, second] = swap ? [owner2, owner1] : [owner1, owner2]
    const [firstHandle, secondHandle] = swap ? [handle2, handle1] : [handle1, handle2]
    if (first.kind === 'floor') return undefined

    const v1 = previous.get(firstHandle) ?? { vx: 0, vy: 0 }
    if (second.kind === 'floor') {
      // 바닥 접촉은 actor만 보고하고, actor의 직전 수직 속력을 상대 속도로 본다.
      // 수평으로 미끄러지기만 해서는 충격이 생기지 않는다.
      if (first.kind !== 'actor') return undefined
      const intensity = intensityForSpeed(Math.abs(v1.vy))
      if (intensity === undefined) return undefined
      return { a: first.id, b: 'floor', intensity, fasterId: first.id }
    }

    const v2 = previous.get(secondHandle) ?? { vx: 0, vy: 0 }
    const intensity = intensityForSpeed(Math.hypot(v1.vx - v2.vx, v1.vy - v2.vy))
    if (intensity === undefined) return undefined
    const fasterId =
      Math.hypot(v2.vx, v2.vy) > Math.hypot(v1.vx, v1.vy) ? second.id : first.id
    return { a: first.id, b: second.id, intensity, fasterId }
  }
}
