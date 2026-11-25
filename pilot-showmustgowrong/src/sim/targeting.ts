import type { CameraDef, ShowDef, TargetSelector } from '@/content/types'
import { STANDING_Y, type Cast } from './cast'
import type { PhenomenonEvent } from './phenomena'
import type { PhysicsWorld } from './physics'
import type { Vec3 } from './vec'

/** 이름이 있는 대상. 위치가 없으면 이동 방향을 정하지 않는다. */
export interface Target {
  id: string | null
  position: Vec3 | null
}

export const NO_TARGET: Target = { id: null, position: null }

/** 행동을 하거나 현상을 내뿜는 주체 */
export interface Emitter {
  id: string
  position: Vec3
}

interface StageLocatorDeps {
  cast: Cast
  physics: PhysicsWorld
  cameras: ReadonlyMap<string, CameraDef>
  audienceZone: ShowDef['audienceZone']
  onAirCamera: () => CameraDef
  /** 송출 카메라가 지금 보는 방향의 화면 안쪽 바닥 지점(서 있는 높이) */
  onAirFramePoint: () => Vec3
}

/** 무대 위 요소(출연자, 장비, 카메라, 관객)의 위치와 TargetSelector 해석 */
export class StageLocator {
  private readonly deps: StageLocatorDeps

  constructor(deps: StageLocatorDeps) {
    this.deps = deps
  }

  /** 이탈한 출연자를 가리키는 선택은 'none'과 같다(Review Focus 2). */
  resolveTarget(selector: TargetSelector, emitter: Emitter, cause: PhenomenonEvent | null): Target {
    if (selector === 'none') return NO_TARGET
    if (selector === 'self') return { id: emitter.id, position: emitter.position }
    if (selector === 'cause') return cause === null ? NO_TARGET : this.targetById(cause.sourceId)
    if (selector === 'onAirCamera') {
      const camera = this.deps.onAirCamera()
      return { id: camera.id, position: camera.position }
    }
    if (selector === 'onAirFrame') {
      return { id: this.deps.onAirCamera().id, position: this.deps.onAirFramePoint() }
    }
    const { cast } = this.deps
    const tag = selector === 'nearestPerformer' ? undefined : selector.tag
    const nearest = cast.nearestActive(emitter.position, emitter.id, tag)
    if (nearest === undefined) return NO_TARGET
    return { id: nearest.def.id, position: cast.position(nearest) }
  }

  targetById(id: string): Target {
    const member = this.deps.cast.get(id)
    if (member !== undefined) {
      return member.walkedOut ? NO_TARGET : { id, position: this.deps.cast.position(member) }
    }
    if (id === 'audience') return { id, position: this.audiencePosition() }
    const position = this.entityPosition(id)
    return position === undefined ? NO_TARGET : { id, position }
  }

  /** 출연자(떠났으면 떠난 자리), 장비, 카메라의 위치 */
  entityPosition(id: string): Vec3 | undefined {
    const member = this.deps.cast.get(id)
    if (member !== undefined) return this.deps.cast.position(member)
    const equipment = this.deps.physics.equipmentState(id)
    if (equipment !== undefined) {
      const { x, y, z } = equipment.position
      return { x, y, z }
    }
    return this.deps.cameras.get(id)?.position
  }

  /** 관객 구역 바닥 중앙, 서 있는 높이 */
  audiencePosition(): Vec3 {
    const zone = this.deps.audienceZone
    return { x: (zone.minX + zone.maxX) / 2, y: STANDING_Y, z: (zone.minZ + zone.maxZ) / 2 }
  }
}
