import type { CameraDef, DirectiveDef, PerformerDef, StaffDef, Weight } from '@/content/types'
import { emotionStyle } from '@/render/emotionBadge'
import type { ActorView, BroadcastInput, BroadcastView } from '@/sim/engineTypes'
import type { EmotionView } from '@/sim/life'
import { formatMoodShift, moodLabel } from './emotionDisplay'
import { cameraName } from './labels'

/** 내리는 감정 변화 칩 색(초록) */
export const FALLING_SHIFT_COLOR = '#22C55E'

/** 감정 변화 칩 하나("짜증 ▼ 크게"). 올리면 그 감정 색, 내리면 초록 */
export interface ShiftChip {
  text: string
  rising: boolean
  color: string
}

export type InterventionTarget = { kind: 'performer'; id: string } | { kind: 'staff'; id: string }

export interface DirectiveOption {
  id: string
  label: string
  /** 이 지시의 예상 결과 한 줄 */
  expect: string
  /** 지시받은 출연자의 감정 변화 칩. 변화가 없거나 스태프 지시면 빈 배열 */
  shifts: ShiftChip[]
  input: BroadcastInput
}

/** 판단 카드(spec 8.2 3단계)에 필요한 대상 정보 */
export interface TargetOption {
  target: InterventionTarget
  name: string
  shortName: string
  /** 출연자 색(#RRGGBB). 스태프는 null */
  color: string | null
  /** 연쇄 역할(출연자) 또는 맡은 일(스태프) 한 단어 */
  role: string
  /** 스태프가 맡은 카메라("CAM 2 클로즈업"). 출연자는 null */
  cameraLabel: string | null
  /** 무엇을 받으면 무엇을 일으키는지 한 줄 */
  tendency: string
  /** 출연자만. 스태프는 null */
  presence: number | null
  /** 남은 내성(ActorView.directivesLeft). 스태프는 null */
  toleranceLeft: number | null
  /** 출연자만. 스태프는 null */
  weight: Weight | null
  /** 대표 감정과 단계 문구("짜증 · 폭발 직전"). 스태프, 이탈, 마음이 없으면 null */
  moodText: string | null
  /** 감정 막대에 그릴 감정들. 스태프, 이탈, 마음이 없으면 빈 배열 */
  emotions: EmotionView[]
  /** 이어받기가 있으면 "이 지시는 {원인}에 이어집니다 · n초". 없으면 null */
  takeoverText: string | null
  /** 지금 지시하면 엇나갈 확률(0~1). 대상 단위라 지시마다 다르지 않다. */
  misfireChance: number
  /** 지시 한 번의 소모 비용 */
  cost: string
  directives: DirectiveOption[]
}

/** 지시의 감정 변화를 칩으로 바꾼다. 감정 이름은 그 출연자의 마음 정의에서 읽고, 모르는 감정은 건너뛴다 */
function shiftChips(directive: DirectiveDef, def: PerformerDef): ShiftChip[] {
  return (directive.moodShifts ?? []).flatMap((shift) => {
    const emotion = def.mind?.emotions.find((candidate) => candidate.id === shift.emotion)
    if (emotion === undefined) return []
    const { text, rising } = formatMoodShift(shift, emotion.name)
    return [{ text, rising, color: rising ? emotionStyle(shift.emotion).color : FALLING_SHIFT_COLOR }]
  })
}

function takeoverText(actor: ActorView): string | null {
  if (actor.takeover === null) return null
  return `이 지시는 ${actor.takeover.text}에 이어집니다 · ${Math.ceil(actor.takeover.remainingBodySeconds)}초`
}

export const PERFORMER_COST = '내성 1 소모 · 누적 피로 +1'
export const STAFF_COST = '스태프 피로 +1'

/**
 * 개입 대상 목록과 카드 정보. 이탈했거나 출구로 걸어가는 출연자는 지시하면 엔진이 throw하므로
 * 빼고(Ruling 16a, 30), 스태프는 setup의 정의와 view의 상태를 합쳐 뒤에 붙인다.
 * 카드 문구(역할, 성향, 예상 결과)는 모두 콘텐츠 데이터에서 읽는다.
 */
export function interventionTargets(
  view: Pick<BroadcastView, 'actors' | 'staff'>,
  performers: ReadonlyMap<string, PerformerDef>,
  staff: readonly StaffDef[],
  cameras: readonly CameraDef[],
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
      color: def.color,
      role: def.role,
      cameraLabel: null,
      tendency: def.tendency,
      presence: def.presence,
      toleranceLeft: actor.directivesLeft,
      weight: def.weight,
      moodText: actor.walkedOut ? null : moodLabel(actor.mood),
      emotions: actor.emotions,
      takeoverText: takeoverText(actor),
      misfireChance: actor.misfireChance,
      cost: PERFORMER_COST,
      directives: def.directives.map((directive) => ({
        id: directive.id,
        label: directive.label,
        expect: directive.expect,
        shifts: shiftChips(directive, def),
        input: { type: 'direct', actorId: actor.id, directiveId: directive.id },
      })),
    })
  }
  for (const member of staff) {
    const state = view.staff.find((candidate) => candidate.id === member.id)
    const camera = cameras.find((candidate) => candidate.id === member.cameraId)
    options.push({
      target: { kind: 'staff', id: member.id },
      name: member.name,
      shortName: member.shortName,
      color: null,
      role: member.role,
      cameraLabel: camera === undefined ? null : cameraName(cameras, camera),
      tendency: member.tendency,
      presence: null,
      toleranceLeft: null,
      weight: null,
      moodText: null,
      emotions: [],
      takeoverText: null,
      misfireChance: state?.misfireChance ?? 0,
      cost: STAFF_COST,
      directives: member.directives.map((directive) => ({
        id: directive.id,
        label: directive.label,
        expect: directive.expect,
        shifts: [],
        input: { type: 'directStaff', staffId: member.id, directiveId: directive.id },
      })),
    })
  }
  return options
}
