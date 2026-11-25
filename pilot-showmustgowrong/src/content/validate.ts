import type { FloorPoint } from '@/sim/vec'
import { STEP_SECONDS, STUDIO_DEPTH, STUDIO_WIDTH } from './balance'
import type {
  ActionDef,
  EquipmentDef,
  PerformerDef,
  ReactionDef,
  ShowDef,
  StaffDef,
  TargetSelector,
} from './types'

function* actionTargets(action: ActionDef): Generator<TargetSelector> {
  if (action.move) yield action.move.toward
  for (const emit of action.emits) yield emit.target
}

function* reactionTargets(reactions: ReactionDef[]): Generator<TargetSelector> {
  for (const reaction of reactions) yield* actionTargets(reaction.action)
}

/** 엔진이 고정 환경 source로 쓰는 id(관객, 방송). 콘텐츠 요소가 쓰면 이벤트의 주체가 섞인다. */
export const RESERVED_IDS: readonly string[] = ['audience', 'broadcast']

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates]
}

/** 바닥 평면(x 0~STUDIO_WIDTH, z 0~STUDIO_DEPTH) 안이면 true. 경계는 포함한다. */
function isInsideStudio(point: FloorPoint): boolean {
  return point.x >= 0 && point.x <= STUDIO_WIDTH && point.z >= 0 && point.z <= STUDIO_DEPTH
}

/** 오류 메시지 목록을 돌려준다. 빈 배열이면 통과. performers는 무대와 대기 출연자를 합친 전체다. */
export function validateShow(
  show: ShowDef,
  performers: PerformerDef[],
  staff: StaffDef[],
  equipment: EquipmentDef[],
): string[] {
  const errors: string[] = []

  const idGroups: [string, string[]][] = [
    ['출연자', performers.map((p) => p.id)],
    ['스태프', staff.map((s) => s.id)],
    ['장비', equipment.map((e) => e.id)],
    ['카메라', show.cameras.map((c) => c.id)],
  ]
  for (const [label, ids] of idGroups) {
    for (const id of findDuplicates(ids)) errors.push(`중복 id: ${label} ${id}`)
    for (const id of new Set(ids)) {
      if (RESERVED_IDS.includes(id)) errors.push(`예약된 id: ${label} ${id}`)
    }
  }

  const knownTags = new Set(performers.flatMap((p) => p.tags))
  const knownCameraIds = new Set(show.cameras.map((c) => c.id))

  const checkTarget = (target: TargetSelector, owner: string) => {
    if (typeof target === 'object' && !knownTags.has(target.tag)) {
      errors.push(`알 수 없는 태그: ${target.tag} (${owner})`)
    }
  }
  const checkReactions = (reactions: ReactionDef[], owner: string) => {
    for (const reaction of reactions) {
      const { chance } = reaction
      if (chance !== undefined && !(chance > 0 && chance <= 1)) {
        errors.push(`확률 범위 오류: ${chance} (${owner})`)
      }
    }
    for (const target of reactionTargets(reactions)) checkTarget(target, owner)
  }

  for (const performer of performers) {
    if (performer.role.trim() === '') errors.push(`빈 역할: ${performer.id}`)
    if (performer.tendency.trim() === '') errors.push(`빈 성향: ${performer.id}`)
    checkReactions(performer.reactions, performer.id)
    for (const directive of performer.directives) {
      if (directive.expect.trim() === '') {
        errors.push(`빈 예상 결과: ${directive.id} (${performer.id})`)
      }
      for (const target of actionTargets(directive.action)) checkTarget(target, performer.id)
    }
  }

  const operatedCameraIds = new Set<string>()
  for (const member of staff) {
    if (!knownCameraIds.has(member.cameraId)) {
      errors.push(`알 수 없는 카메라: ${member.cameraId} (${member.id})`)
    }
    if (operatedCameraIds.has(member.cameraId)) {
      errors.push(`한 카메라를 두 스태프가 맡음: ${member.cameraId} (${member.id})`)
    }
    operatedCameraIds.add(member.cameraId)
    const { recovery } = member
    // 복귀는 적어도 한 스텝 걸려야 유지와 복귀 사이의 보간이 정의된다.
    if (recovery !== undefined && (recovery.holdSeconds < 0 || recovery.returnSeconds < STEP_SECONDS)) {
      errors.push(
        `복구 시간 범위 오류: 유지 ${recovery.holdSeconds}초, 복귀 ${recovery.returnSeconds}초 (${member.id})`,
      )
    }
    checkReactions(member.reactions, member.id)
  }

  for (const piece of equipment) {
    for (const emit of piece.onBreak) checkTarget(emit.target, piece.id)
  }

  const placements: [string, FloorPoint][] = [
    ...show.homeSpots.map((spot, index): [string, FloorPoint] => [`home spot ${index + 1}`, spot]),
    ['bench spot', show.benchSpot],
    ['exit', show.exit],
    ...equipment.map((piece): [string, FloorPoint] => [`장비 ${piece.id}`, piece.position]),
    ...show.cameras.map((camera): [string, FloorPoint] => [`카메라 ${camera.id}`, camera.position]),
  ]
  for (const [label, point] of placements) {
    if (!isInsideStudio(point)) errors.push(`스튜디오 밖 좌표: ${label} (${point.x}, ${point.z})`)
  }

  return errors
}
