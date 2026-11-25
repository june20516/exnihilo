import type { PerformerDef, ReactionDef, StaffDef, Weight } from '@/content/types'
import type { BroadcastInput, BroadcastView } from '@/sim/engineTypes'
import { PHENOMENON_LABELS, STAFF_AIM_EXPECT } from './labels'

export type InterventionTarget = { kind: 'performer'; id: string } | { kind: 'staff'; id: string }

export interface DirectiveOption {
  id: string
  label: string
  /** 이 지시의 예상 결과 한 줄 */
  expect: string
  input: BroadcastInput
}

/** 판단 카드(spec 8.2 3단계)에 필요한 대상 정보 */
export interface TargetOption {
  target: InterventionTarget
  name: string
  shortName: string
  /** 출연자의 연쇄 역할, 스태프는 '스태프' */
  role: string
  /** 무엇을 받으면 무엇을 일으키는지 한 줄 */
  tendency: string
  /** 출연자만. 스태프는 null */
  presence: number | null
  /** 남은 내성(ActorView.directivesLeft). 스태프는 null */
  toleranceLeft: number | null
  /** 출연자만. 스태프는 null */
  weight: Weight | null
  /** 지금 지시하면 엇나갈 확률(0~1). 대상 단위라 지시마다 다르지 않다. */
  misfireChance: number
  /** 지시 한 번의 소모 비용 */
  cost: string
  directives: DirectiveOption[]
}

export const PERFORMER_COST = '내성 1 소모 · 누적 피로 +1'
export const STAFF_COST = '스태프 피로 +1'

/** 스태프 반응 데이터로 성향 한 줄을 만든다(출연자처럼 따로 적어 둔 문구가 없다). */
function staffTendency(reactions: readonly ReactionDef[]): string {
  const triggers = reactions.flatMap(({ trigger }) =>
    'min' in trigger ? [`${PHENOMENON_LABELS[trigger.kind]} ${trigger.min}↑`] : [],
  )
  if (triggers.length === 0) return '놀라지 않는다'
  return `${triggers.join(', ')} 인지하면 놀라 카메라를 돌림 → 잠시 뒤 스스로 복구`
}

/**
 * 개입 대상 목록과 카드 정보. 이탈했거나 출구로 걸어가는 출연자는 지시하면 엔진이 throw하므로
 * 빼고(Ruling 16a, 30), 스태프는 setup의 정의와 view의 상태를 합쳐 뒤에 붙인다.
 */
export function interventionTargets(
  view: Pick<BroadcastView, 'actors' | 'staff'>,
  performers: ReadonlyMap<string, PerformerDef>,
  staff: readonly StaffDef[],
): TargetOption[] {
  const options: TargetOption[] = []
  for (const actor of view.actors) {
    if (actor.walkedOut || actor.departed) continue
    const def = performers.get(actor.id)
    if (def === undefined) continue
    options.push({
      target: { kind: 'performer', id: actor.id },
      name: actor.name,
      shortName: def.shortName,
      role: def.role,
      tendency: def.tendency,
      presence: def.presence,
      toleranceLeft: actor.directivesLeft,
      weight: def.weight,
      misfireChance: actor.misfireChance,
      cost: PERFORMER_COST,
      directives: def.directives.map((directive) => ({
        id: directive.id,
        label: directive.label,
        expect: directive.expect,
        input: { type: 'direct', actorId: actor.id, directiveId: directive.id },
      })),
    })
  }
  for (const member of staff) {
    const state = view.staff.find((candidate) => candidate.id === member.id)
    options.push({
      target: { kind: 'staff', id: member.id },
      name: member.name,
      shortName: member.shortName,
      role: '스태프',
      tendency: staffTendency(member.reactions),
      presence: null,
      toleranceLeft: null,
      weight: null,
      misfireChance: state?.misfireChance ?? 0,
      cost: STAFF_COST,
      directives: member.directives.map((directive) => ({
        id: directive.id,
        label: directive.label,
        expect: STAFF_AIM_EXPECT[directive.aim],
        input: { type: 'directStaff', staffId: member.id, directiveId: directive.id },
      })),
    })
  }
  return options
}
