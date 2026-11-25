import { CAPSULE } from '@/content/balance'
import type { PerformerDef, Pose } from '@/content/types'
import type { PhenomenonEvent } from './phenomena'
import type { PhysicsWorld } from './physics'
import { distance3, type FloorPoint, type Vec3 } from './vec'

interface Placement {
  position: Vec3
  /** 몸의 위 방향 단위 벡터. 서 있으면 (0, 1, 0). */
  up: Vec3
  tumbling: boolean
  grounded: boolean
}

/** 서 있는 캡슐 중심의 높이. physics.ts의 배치와 같은 계산이다. */
export const STANDING_Y = CAPSULE.halfHeight + CAPSULE.radius

export interface CastMember {
  readonly def: PerformerDef
  home: FloorPoint
  pose: Pose
  walkedOut: boolean
  /** 이탈한 스텝. 이탈하지 않았으면 null */
  walkoutStep: number | null
  /** 물리 월드에서 빠진 뒤의 마지막 자리. 아직 무대(물리 월드)에 있으면 null */
  departedAt: Placement | null
  /** 지금 이 출연자를 움직이게 한 원인 이벤트(마지막 행동의 원인 또는 자신을 친 충격) */
  motionCause: PhenomenonEvent | null
  /** motionCause를 받은 스텝. MOTION_CAUSE_SECONDS가 지나면 원인으로 잇지 않는다. */
  motionCauseStep: number
  /** 직전 스텝에 송출 화면 안에 있었는지 */
  wasOnAir: boolean
  /** 송출 화면 밖에 연속으로 있었던 스텝 수 */
  absentSteps: number
}

/** 무대에 오른 출연자들의 상태와 위치. 출연자 id는 물리 actor id와 같다. */
export class Cast {
  private readonly physics: PhysicsWorld
  private readonly members = new Map<string, CastMember>()

  constructor(physics: PhysicsWorld) {
    this.physics = physics
  }

  add(def: PerformerDef, home: FloorPoint): CastMember {
    this.physics.addActor(def.id, home, def.weight)
    const member: CastMember = {
      def,
      home: { x: home.x, z: home.z },
      pose: 'idle',
      walkedOut: false,
      walkoutStep: null,
      departedAt: null,
      motionCause: null,
      motionCauseStep: 0,
      wasOnAir: false,
      absentSteps: 0,
    }
    this.members.set(def.id, member)
    return member
  }

  get(id: string): CastMember | undefined {
    return this.members.get(id)
  }

  /** 무대에 오른 순서대로 전원(이탈자 포함) */
  all(): CastMember[] {
    return [...this.members.values()]
  }

  /** 이탈하지 않은 출연자. 반응, 대상 선택, 시선 판정은 이들만 쓴다(Review Focus 2). */
  active(): CastMember[] {
    return this.all().filter((member) => !member.walkedOut)
  }

  /** 물리 몸이 있는 출연자(출구로 걸어가는 이탈자 포함) */
  present(): CastMember[] {
    return this.all().filter((member) => member.departedAt === null)
  }

  /** 물리 상태 또는 떠난 자리. 물리 엔진의 벡터 객체를 쓰지 않도록 평범한 객체로 복사한다. */
  placement(member: CastMember): Placement {
    if (member.departedAt !== null) return member.departedAt
    const state = this.physics.actorState(member.def.id)
    if (state === undefined) throw new Error(`물리 월드에 없는 출연자입니다: ${member.def.id}`)
    const { position, up } = state
    return {
      position: { x: position.x, y: position.y, z: position.z },
      up: { x: up.x, y: up.y, z: up.z },
      tumbling: state.tumbling,
      grounded: state.grounded,
    }
  }

  position(member: CastMember): Vec3 {
    return this.placement(member).position
  }

  /** 물리 월드에서 뺀다. 마지막 자리는 view용으로 남긴다. */
  depart(member: CastMember): void {
    if (member.departedAt !== null) return
    member.departedAt = { ...this.placement(member), tumbling: false, grounded: true }
    this.physics.removeActor(member.def.id)
  }

  /** from에서 가장 가까운 이탈하지 않은 출연자. 같은 거리면 먼저 오른 출연자. */
  nearestActive(from: Vec3, excludeId: string | null, tag?: string): CastMember | undefined {
    let nearest: CastMember | undefined
    let nearestDistance = Infinity
    for (const member of this.active()) {
      if (member.def.id === excludeId) continue
      if (tag !== undefined && !member.def.tags.includes(tag)) continue
      const distance = distance3(this.position(member), from)
      if (distance < nearestDistance) {
        nearest = member
        nearestDistance = distance
      }
    }
    return nearest
  }
}
