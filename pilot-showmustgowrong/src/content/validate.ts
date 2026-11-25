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
    checkReactions(performer.reactions, performer.id)
    for (const directive of performer.directives) {
      for (const target of actionTargets(directive.action)) checkTarget(target, performer.id)
    }
  }

  for (const member of staff) {
    if (!knownCameraIds.has(member.cameraId)) {
      errors.push(`알 수 없는 카메라: ${member.cameraId} (${member.id})`)
    }
    checkReactions(member.reactions, member.id)
  }

  for (const piece of equipment) {
    for (const emit of piece.onBreak) checkTarget(emit.target, piece.id)
  }

  return errors
}
