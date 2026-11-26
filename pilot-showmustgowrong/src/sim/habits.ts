import type { EmotionId, HabitCondition, HabitDef, ShowDef } from '@/content/types'
import type { Mind } from './emotion'
import type { PhenomenonEvent } from './phenomena'

/** 버릇 조건 판정에 필요한 출연자 상태(LifeMember의 부분) */
export interface HabitSubject {
  onAir: boolean
  nearTags: readonly string[]
}

/** selector를 실제 대상 출연자로 바꾸는 일은 엔진 몫이다 */
export type HabitTargetResolved =
  | { kind: 'actor'; id: string }
  | { kind: 'selector'; selector: 'nearestPerformer' | { tag: string } }
  | null

function respondsToKind(habit: HabitDef, event: PhenomenonEvent): boolean {
  return (
    habit.respondsTo !== undefined &&
    (habit.respondsTo.kinds as readonly string[]).includes(event.kind)
  )
}

/** 이 현상 종류에 응답하는 버릇이 하나라도 있는가 */
export function hasResponder(habits: readonly HabitDef[], event: PhenomenonEvent): boolean {
  return habits.some((habit) => respondsToKind(habit, event))
}

function conditionMet(
  condition: HabitCondition,
  subject: HabitSubject,
  mind: Mind,
  show: ShowDef,
): boolean {
  switch (condition.kind) {
    case 'onScreen':
      return subject.onAir
    case 'offScreen':
      return !subject.onAir
    case 'nearTag':
      return subject.nearTags.includes(condition.tag) === condition.present
    case 'showTrait':
      return show.traits.includes(condition.trait)
    case 'stage':
      return mind.stage(condition.emotion) >= condition.atLeast
  }
}

/** 조건이 모두 만족되는가(조건이 없으면 참) */
export function conditionsMet(
  habit: HabitDef,
  subject: HabitSubject,
  mind: Mind,
  show: ShowDef,
): boolean {
  return (habit.when ?? []).every((condition) => conditionMet(condition, subject, mind, show))
}

/** 받은 현상 종류에 응답하고 조건을 만족하는 버릇 */
export function responseCandidates(
  habits: readonly HabitDef[],
  event: PhenomenonEvent,
  subject: HabitSubject,
  mind: Mind,
  show: ShowDef,
): HabitDef[] {
  return habits.filter(
    (habit) => respondsToKind(habit, event) && conditionsMet(habit, subject, mind, show),
  )
}

/** 응답이 아니고 조건을 만족하며 쿨다운 밖인 버릇 */
export function clockCandidates(
  habits: readonly HabitDef[],
  subject: HabitSubject,
  mind: Mind,
  show: ShowDef,
  usedAt: ReadonlyMap<string, number>,
  step: number,
  cooldownSteps: number,
): HabitDef[] {
  return habits.filter((habit) => {
    if (habit.respondsTo !== undefined || !conditionsMet(habit, subject, mind, show)) return false
    const lastUsed = usedAt.get(habit.id)
    return lastUsed === undefined || step - lastUsed >= cooldownSteps
  })
}

/** 가중치 × (1 + factor × 값/100). 음수 가중치는 0으로 자른다 */
export function habitWeight(habit: HabitDef, mind: Mind): number {
  const boost = habit.boost
    ? 1 + (habit.boost.factor * mind.value(habit.boost.emotion)) / 100
    : 1
  return Math.max(0, habit.weight * boost)
}

/**
 * 가중치(boost 반영)로 하나 뽑는다. roll은 [0, 1) 난수 하나를 돌려준다.
 * 후보가 없거나 가중치 합이 0 이하이면 난수를 쓰지 않고 null이다.
 */
export function pickWeighted(
  candidates: readonly HabitDef[],
  mind: Mind,
  roll: () => number,
): HabitDef | null {
  const weights = candidates.map((habit) => habitWeight(habit, mind))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (candidates.length === 0 || total <= 0) return null
  let remaining = roll() * total
  for (const [index, weight] of weights.entries()) {
    remaining -= weight
    if (remaining < 0) return candidates[index]
  }
  return candidates[candidates.length - 1]
}

/** 지금 값이 가장 높은 감정(같으면 앞선 것)의 가장 큰 이유가 사건이면 그 사건을 낸 쪽 */
export function topContributorSourceId(mind: Mind): string | undefined {
  let leading: EmotionId | null = null
  for (const emotion of mind.emotions) {
    if (leading === null || mind.value(emotion.id) > mind.value(leading)) leading = emotion.id
  }
  if (leading === null) return undefined
  const top = mind.topReasons(leading, 1)[0]
  return top?.source.type === 'event' ? top.source.event.sourceId : undefined
}

/** 버릇의 대상을 해석한다. actor 대상은 has()인 출연자만이고, selector는 엔진이 푼다 */
export function resolveHabitTarget(
  habit: HabitDef,
  cause: PhenomenonEvent | null,
  mind: Mind,
  has: (id: string) => boolean,
): HabitTargetResolved {
  const target = habit.stir?.target ?? 'none'
  const actorTarget = (id: string | undefined): HabitTargetResolved =>
    id !== undefined && has(id) ? { kind: 'actor', id } : null
  if (target === 'none') return null
  if (target === 'nearestPerformer') return { kind: 'selector', selector: 'nearestPerformer' }
  if (target === 'cause') return actorTarget(cause?.sourceId)
  if (target === 'topContributor') return actorTarget(topContributorSourceId(mind))
  return { kind: 'selector', selector: { tag: target.tag } }
}
