import { STEP_SECONDS, TENSION_WINDOW_SECONDS, VIEWERS_TREND_EPSILON } from '@/content/balance'
import type { ReactionDef } from '@/content/types'
import type { CastMember } from './cast'
import { targetsSelf, type PhenomenonEvent } from './phenomena'
import { cooldownKey, type CooldownTable } from './reactions'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
/** 긴장도가 되돌아보는 스텝 수. 엔진이 최근 이벤트를 고를 때도 쓴다. */
export const TENSION_WINDOW_STEPS = Math.round(TENSION_WINDOW_SECONDS * STEPS_PER_SECOND)

/** 화면 밖에 있던 시간이 다음 발동까지 얼마나 찼는지. gaze.ts의 발동 주기와 같은 계산이다. */
function absentProgress(member: CastMember, seconds: number): number {
  const period = Math.max(1, Math.round(seconds * STEPS_PER_SECOND))
  return (member.absentSteps % period) / period
}

/** 최근 창 안에서 인지한 같은 종류 현상 중 최소 강도에 못 미친 것의 강도 ÷ 최소 강도. */
function eventProgress(
  reaction: ReactionDef,
  member: CastMember,
  recent: readonly PhenomenonEvent[],
  cooldowns: CooldownTable,
  step: number,
  perceivesEvent: (event: PhenomenonEvent) => boolean,
): number {
  const { trigger } = reaction
  if (trigger.kind === 'gaze' || trigger.kind === 'corner') return 0
  if (!cooldowns.ready(member.def.id, cooldownKey(trigger), step)) return 0

  let progress = 0
  for (const event of recent) {
    if (event.kind !== trigger.kind || event.intensity >= trigger.min) continue
    if (step - event.step > TENSION_WINDOW_STEPS) continue
    if (trigger.scope === 'targetsSelf' && !targetsSelf(event, member.def.id)) continue
    if (!perceivesEvent(event)) continue
    progress = Math.max(progress, event.intensity / trigger.min)
  }
  return progress
}

/**
 * 출연자가 다음 반응에 얼마나 가까운지 0~1(spec 8.2). 반응마다 진행도를 구해 가장 큰 값을 쓴다.
 * recent는 최근 이벤트 후보이고, 창 밖의 것은 여기서 거른다.
 */
export function tensionOf(
  member: CastMember,
  recent: readonly PhenomenonEvent[],
  cooldowns: CooldownTable,
  step: number,
  perceivesEvent: (event: PhenomenonEvent) => boolean,
): number {
  if (member.walkedOut) return 0
  let tension = 0
  for (const reaction of member.def.reactions) {
    const { trigger } = reaction
    const progress =
      trigger.kind === 'gaze' && trigger.when === 'absentFor'
        ? absentProgress(member, trigger.seconds)
        : eventProgress(reaction, member, recent, cooldowns, step, perceivesEvent)
    tension = Math.max(tension, progress)
  }
  return Math.min(1, tension)
}

/** 1초 전과 비교한 시청자 추세. 차이가 VIEWERS_TREND_EPSILON 이하면 0이다. */
export function viewersTrendOf(current: number, oneSecondAgo: number): -1 | 0 | 1 {
  const difference = current - oneSecondAgo
  if (Math.abs(difference) <= VIEWERS_TREND_EPSILON) return 0
  return difference > 0 ? 1 : -1
}
