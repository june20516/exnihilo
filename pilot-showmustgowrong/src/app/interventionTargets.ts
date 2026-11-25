import type { PerformerDef, StaffDef } from '@/content/types'
import type { ActorView, BroadcastInput } from '@/sim/engineTypes'

export type InterventionTarget = { kind: 'performer'; id: string } | { kind: 'staff'; id: string }

export interface DirectiveOption {
  id: string
  label: string
  input: BroadcastInput
}

export interface TargetOption {
  target: InterventionTarget
  name: string
  /** 출연자는 남은 내성(ActorView.directivesLeft), 스태프는 null */
  directivesLeft: number | null
  directives: DirectiveOption[]
}

/**
 * 개입 패널의 대상 목록. 이탈했거나 출구로 걸어가는 출연자는 지시하면 엔진이 throw하므로
 * 빼고(Ruling 16a, 30), 스태프는 BroadcastView에 없으니 setup에서 읽어 뒤에 붙인다.
 */
export function interventionTargets(
  actors: readonly ActorView[],
  performers: ReadonlyMap<string, PerformerDef>,
  staff: readonly StaffDef[],
): TargetOption[] {
  const options: TargetOption[] = []
  for (const actor of actors) {
    if (actor.walkedOut || actor.departed) continue
    const def = performers.get(actor.id)
    if (def === undefined) continue
    options.push({
      target: { kind: 'performer', id: actor.id },
      name: actor.name,
      directivesLeft: actor.directivesLeft,
      directives: def.directives.map((directive) => ({
        id: directive.id,
        label: directive.label,
        input: { type: 'direct', actorId: actor.id, directiveId: directive.id },
      })),
    })
  }
  for (const member of staff) {
    options.push({
      target: { kind: 'staff', id: member.id },
      name: member.name,
      directivesLeft: null,
      directives: member.directives.map((directive) => ({
        id: directive.id,
        label: directive.label,
        input: { type: 'directStaff', staffId: member.id, directiveId: directive.id },
      })),
    })
  }
  return options
}
