import { validateTunables, type TunableDef } from '@/kit/tuning/tuning'
import type { FloorPoint } from '@/sim/vec'
import { STEP_SECONDS, STUDIO_DEPTH, STUDIO_WIDTH } from './balance'
import { TEMPLATE_TOKEN } from './templateTokens'
import { TUNABLES } from './tuning'
import {
  COMMON_EMOTIONS,
  type ActionDef,
  type EmotionDef,
  type EmotionThresholds,
  type EquipmentDef,
  type HabitDef,
  type MindDef,
  type MoodShift,
  type PerformerDef,
  type ReactionDef,
  type ShowDef,
  type StaffDef,
  type TargetSelector,
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

const MAX_PERSONAL_EMOTIONS = 2
const COMMON_EMOTION_IDS: readonly string[] = COMMON_EMOTIONS

function isBlank(text: string): boolean {
  return text.trim() === ''
}

/** 감정 문턱이 0 < 내림 < 진입 <= 100, 1단계 < 2단계, 2단계 진입 <= intense <= 100을 지키는지. tuning.ts의 문턱 관계와 같은 규칙이다 */
export function isValidThresholds({ rise, fall, intense }: EmotionThresholds): boolean {
  const pairsValid = [0, 1].every((i) => 0 < fall[i] && fall[i] < rise[i] && rise[i] <= 100)
  return pairsValid && rise[0] < rise[1] && fall[0] < fall[1] && rise[1] <= intense && intense <= 100
}

type TemplateSlot = 'plain' | 'target' | 'accumulate'

/** 자리별 필수 접두사와 허용 토큰. plain은 토큰 없음, target은 {target} 계열, accumulate는 {reasons[:을|에]} */
interface SlotRule {
  required: string | null
  isAllowed: (name: string, josa?: string) => boolean
}

const SLOT_RULES: Record<TemplateSlot, SlotRule> = {
  plain: { required: null, isAllowed: () => false },
  target: { required: null, isAllowed: (name) => name === 'target' },
  accumulate: {
    required: '{reasons',
    isAllowed: (name, josa) =>
      name === 'reasons' && (josa === undefined || josa === '을' || josa === '에'),
  },
}

/** 문형 문자열의 토큰 후보({로 시작해 }까지, 닫히지 않으면 끝까지) 중 자리에 허용되지 않는 것 */
function findDisallowedTokens(text: string, slot: TemplateSlot): string[] {
  const exactToken = new RegExp(`^${TEMPLATE_TOKEN.source}$`)
  const candidates = text.match(/\{[^}]*(\}|$)/g) ?? []
  return candidates.filter((candidate) => {
    const match = exactToken.exec(candidate)
    return match === null || !SLOT_RULES[slot].isAllowed(match[1], match[2])
  })
}

/** 문형 오류를 모은다. targetLine(requireTarget)은 {target이, accumulate는 {reasons가 반드시 있어야 한다. */
function checkTemplate(
  text: string,
  field: string,
  slot: TemplateSlot,
  owner: string,
  requireTarget = false,
): string[] {
  const errors: string[] = []
  const required = requireTarget ? '{target' : SLOT_RULES[slot].required
  if (required !== null && !text.includes(required)) {
    errors.push(`문형 오류: ${field}에 ${required} 없음 (${owner})`)
  }
  for (const token of findDisallowedTokens(text, slot)) {
    errors.push(`문형 오류: ${field}의 허용되지 않는 토큰 ${token} (${owner})`)
  }
  return errors
}

function checkEmotionSet(mind: MindDef, owner: string): string[] {
  const errors: string[] = []
  const ids = mind.emotions.map((emotion) => emotion.id)
  for (const id of COMMON_EMOTIONS) {
    if (!ids.includes(id)) errors.push(`공용 감정 누락 오류: ${id} (${owner})`)
  }
  const personalCount = ids.filter((id) => !COMMON_EMOTION_IDS.includes(id)).length
  if (personalCount > MAX_PERSONAL_EMOTIONS) errors.push(`개인 감정 개수 오류: ${personalCount} (${owner})`)
  for (const id of findDuplicates(ids)) errors.push(`중복 감정 오류: ${id} (${owner})`)
  for (const emotion of mind.emotions) {
    errors.push(...checkTemplate(emotion.accumulate, 'accumulate', 'accumulate', owner))
    errors.push(...checkEmotionLabels(emotion, owner))
  }
  return errors
}

/** 단계 이름과 단계 진입 술어는 토큰 없이(plain) 비어 있지 않아야 한다. */
function checkEmotionLabels(emotion: EmotionDef, owner: string): string[] {
  const errors: string[] = []
  const fields = [
    ['stageNames', emotion.stageNames],
    ['stageLines', emotion.stageLines],
  ] as const
  for (const [name, texts] of fields) {
    texts.forEach((text, index) => {
      const field = `${emotion.id}.${name}[${index}]`
      if (isBlank(text)) errors.push(`빈 감정 문구 오류: ${field} (${owner})`)
      errors.push(...checkTemplate(text, field, 'plain', owner))
    })
  }
  return errors
}

function checkEmotionReferences(mind: MindDef, owner: string): string[] {
  const errors: string[] = []
  const known = new Set(mind.emotions.map((emotion) => emotion.id))
  const checkRef = (where: string, id: string) => {
    if (!known.has(id)) errors.push(`없는 감정 오류: ${where} ${id} (${owner})`)
  }
  for (const id of known) {
    if (!(id in mind.bursts)) errors.push(`터짐 누락 오류: ${id} (${owner})`)
  }
  for (const id of Object.keys(mind.bursts)) checkRef('bursts', id)
  for (const id of Object.keys(mind.baseline ?? {})) checkRef('baseline', id)
  for (const id of Object.keys(mind.thresholds ?? {})) checkRef('thresholds', id)
  for (const sensitivity of mind.sensitivities) checkRef('sensitivities', sensitivity.emotion)
  for (const habit of mind.habits) {
    if (habit.boost) checkRef('boost', habit.boost.emotion)
    for (const condition of habit.when ?? []) {
      if (condition.kind === 'stage') checkRef('stage', condition.emotion)
    }
  }
  return errors
}

function checkThresholds(mind: MindDef, owner: string): string[] {
  const errors: string[] = []
  for (const [id, thresholds] of Object.entries(mind.thresholds ?? {})) {
    if (thresholds && !isValidThresholds(thresholds)) errors.push(`문턱 오류: ${id} (${owner})`)
  }
  return errors
}

function checkSensitivities(mind: MindDef, owner: string): string[] {
  const errors: string[] = []
  for (const sensitivity of mind.sensitivities) {
    if (sensitivity.on === 'event') {
      if (sensitivity.amount === 0) errors.push(`민감도 오류: amount 0 (${owner})`)
      continue
    }
    if (!(sensitivity.perShowMinute > 0)) {
      errors.push(`민감도 오류: perShowMinute ${sensitivity.perShowMinute} (${owner})`)
    }
    const fade = sensitivity.fadePerShowMinute
    if (fade !== undefined && !(fade > 0)) errors.push(`민감도 오류: fadePerShowMinute ${fade} (${owner})`)
    if (isBlank(sensitivity.label.noun) || isBlank(sensitivity.label.clause)) {
      errors.push(`민감도 오류: label (${owner})`)
    }
    errors.push(
      ...checkTemplate(sensitivity.label.noun, 'label.noun', 'plain', owner),
      ...checkTemplate(sensitivity.label.clause, 'label.clause', 'plain', owner),
    )
  }
  return errors
}

const GRAPHEME_SEGMENTER = new Intl.Segmenter('ko', { granularity: 'grapheme' })
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

function countGraphemes(text: string): number {
  return [...GRAPHEME_SEGMENTER.segment(text)].length
}

function checkHabit(habit: HabitDef, knownTags: ReadonlySet<string>, owner: string): string[] {
  const errors: string[] = []
  for (const field of ['line', 'recall', 'noun'] as const) {
    if (isBlank(habit[field])) errors.push(`빈 버릇 문구 오류: ${field} ${habit.id} (${owner})`)
  }
  if (countGraphemes(habit.emote) !== 1) {
    errors.push(`버릇 이모트 오류: "${habit.emote}"는 그래핌 1개여야 함 (${habit.id}, ${owner})`)
  }
  if (!(habit.weight > 0)) errors.push(`버릇 가중치 오류: ${habit.weight} (${habit.id}, ${owner})`)
  if (habit.respondsTo) {
    const { chance, kinds } = habit.respondsTo
    if (!(chance > 0 && chance <= 1)) errors.push(`응답 확률 오류: ${chance} (${habit.id}, ${owner})`)
    if (kinds.length === 0) errors.push(`응답 종류 오류: ${habit.id} (${owner})`)
  }
  const stirTarget = habit.stir?.target
  const tags: string[] = []
  if (typeof stirTarget === 'object') tags.push(stirTarget.tag)
  for (const condition of habit.when ?? []) {
    if (condition.kind === 'nearTag') tags.push(condition.tag)
  }
  for (const tag of tags) {
    if (!knownTags.has(tag)) errors.push(`알 수 없는 태그: ${tag} (${owner})`)
  }
  errors.push(
    ...checkTemplate(habit.line, 'line', 'plain', owner),
    ...checkTemplate(habit.recall, 'recall', 'plain', owner),
    ...checkTemplate(habit.noun, 'noun', 'plain', owner),
  )
  if (habit.targetLine !== undefined) {
    errors.push(...checkTemplate(habit.targetLine, 'targetLine', 'target', owner, true))
  }
  return errors
}

function checkHabits(mind: MindDef, knownTags: ReadonlySet<string>, owner: string): string[] {
  const errors: string[] = []
  if (mind.habits.length === 0) errors.push(`버릇 개수 오류: 0 (${owner})`)
  for (const id of findDuplicates(mind.habits.map((habit) => habit.id))) {
    errors.push(`중복 버릇 id: ${id} (${owner})`)
  }
  for (const habit of mind.habits) errors.push(...checkHabit(habit, knownTags, owner))
  if (mind.habits.length > 0 && mind.habits.every((habit) => habit.respondsTo !== undefined)) {
    errors.push(`버릇 시계 버릇 개수 오류: 0 (${owner})`)
  }
  return errors
}

function checkBurstLines(mind: MindDef, owner: string): string[] {
  const errors: string[] = []
  for (const [emotionId, { small, big }] of Object.entries(mind.bursts)) {
    for (const [size, burst] of [['small', small], ['big', big]] as const) {
      const field = (name: string) => `${emotionId}.${size}.${name}`
      errors.push(...checkTemplate(burst.line, field('line'), 'plain', owner))
      if (burst.targetLine !== undefined) {
        errors.push(...checkTemplate(burst.targetLine, field('targetLine'), 'target', owner, true))
      }
      if (burst.intenseLine !== undefined) {
        errors.push(...checkTemplate(burst.intenseLine, field('intenseLine'), 'target', owner))
      }
    }
  }
  return errors
}

function checkMind(mind: MindDef, knownTags: ReadonlySet<string>, owner: string): string[] {
  return [
    ...checkEmotionSet(mind, owner),
    ...checkEmotionReferences(mind, owner),
    ...checkThresholds(mind, owner),
    ...checkSensitivities(mind, owner),
    ...checkHabits(mind, knownTags, owner),
    ...checkBurstLines(mind, owner),
  ]
}

/** 지시의 감정 변화. 지시받는 출연자의 감정만 가리킨다(mind가 없으면 공용 4개). */
function checkMoodShifts(
  moodShifts: MoodShift[],
  directiveId: string,
  emotionIds: ReadonlySet<string>,
  owner: string,
): string[] {
  const errors: string[] = []
  for (const shift of moodShifts) {
    if (shift.amount === 0) errors.push(`감정 변화 오류: amount 0 (${directiveId}, ${owner})`)
    if (!emotionIds.has(shift.emotion)) errors.push(`없는 감정 오류: moodShifts ${shift.emotion} (${owner})`)
  }
  return errors
}

/**
 * 오류 메시지 목록을 돌려준다. 빈 배열이면 통과. performers는 무대와 대기 출연자를 합친 전체다.
 * tunables는 조정 항목 정의다(spec Plan B1 1.4: 모든 기본값이 자기 범위 안). 테스트가 잘못된 정의를 넣을 수 있게 인자로 받는다.
 */
export function validateShow(
  show: ShowDef,
  performers: PerformerDef[],
  staff: StaffDef[],
  equipment: EquipmentDef[],
  tunables: readonly TunableDef[] = TUNABLES,
): string[] {
  const errors: string[] = validateTunables(tunables).map((error) => `조정 항목 오류: ${error}`)

  if (!(Number.isFinite(show.showMinutes) && show.showMinutes > 0)) errors.push(`극 중 길이 오류: ${show.showMinutes}분`)
  const { hour, minute } = show.startTime
  const validHour = Number.isInteger(hour) && hour >= 0 && hour <= 23
  const validMinute = Number.isInteger(minute) && minute >= 0 && minute <= 59
  if (!validHour || !validMinute) {
    errors.push(`시작 시각 오류: ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }
  if (show.traits.some((trait) => trait.trim() === '')) errors.push('빈 속성 태그')

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

  // 대상·조건 태그는 이 출연자 하나가 아니라 쇼 전체 출연자 태그의 합집합에서 찾는다.
  const knownTags = new Set(performers.flatMap((p) => p.tags))
  const knownCameraIds = new Set(show.cameras.map((c) => c.id))

  const { autoCut } = show
  if (autoCut.rotation.length === 0) errors.push('자동 컷 오류: rotation이 비어 있음')
  const autoCutCameras: [string, string][] = [
    ...autoCut.rotation.map((id): [string, string] => ['rotation', id]),
    ['incidentCamera', autoCut.incidentCamera],
    ['fallbackCamera', autoCut.fallbackCamera],
  ]
  for (const [field, id] of autoCutCameras) {
    if (!knownCameraIds.has(id)) errors.push(`자동 컷 오류: ${field}에 없는 카메라 ${id}`)
  }
  const incident = show.cameras.find((camera) => camera.id === autoCut.incidentCamera)
  if (incident !== undefined && incident.tracking !== true) {
    errors.push(`자동 컷 오류: incidentCamera ${autoCut.incidentCamera}가 추적 카메라가 아님`)
  }

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
    if (!HEX_COLOR.test(performer.color)) errors.push(`출연자 색 오류: ${performer.color} (${performer.id})`)
  }
  for (const color of findDuplicates(performers.map((p) => p.color.toUpperCase()))) {
    errors.push(`출연자 색 중복 오류: ${color}`)
  }

  for (const performer of performers) {
    if (performer.role.trim() === '') errors.push(`빈 역할: ${performer.id}`)
    if (performer.tendency.trim() === '') errors.push(`빈 성향: ${performer.id}`)
    checkReactions(performer.reactions, performer.id)
    const emotionIds = new Set<string>(performer.mind?.emotions.map((e) => e.id) ?? COMMON_EMOTIONS)
    for (const directive of performer.directives) {
      if (directive.expect.trim() === '') {
        errors.push(`빈 예상 결과: ${directive.id} (${performer.id})`)
      }
      for (const target of actionTargets(directive.action)) checkTarget(target, performer.id)
      errors.push(...checkMoodShifts(directive.moodShifts ?? [], directive.id, emotionIds, performer.id))
    }
    if (performer.mind) errors.push(...checkMind(performer.mind, knownTags, performer.id))
  }

  const operatedCameraIds = new Set<string>()
  for (const member of staff) {
    if (member.role.trim() === '') errors.push(`빈 역할: ${member.id}`)
    if (member.tendency.trim() === '') errors.push(`빈 성향: ${member.id}`)
    for (const directive of member.directives) {
      if (directive.expect.trim() === '') {
        errors.push(`빈 예상 결과: ${directive.id} (${member.id})`)
      }
    }
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
