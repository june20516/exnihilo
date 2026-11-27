import { tuned } from '@/content/tuning'
import type { MoodShift } from '@/content/types'
import type { ActorView } from '@/sim/engineTypes'
import type { EmotionView } from '@/sim/life'
import { reasonNoun } from '@/sim/narration'

/**
 * 감정 값을 "다음 단계까지 얼마나 가까운가"(0~100)로 바꾼다.
 * 1단계 문턱(rise[0])까지는 0~50으로 늘려 비추고, 문턱을 넘으면 50에서 시작해 1:1로 오른다(100에서 멈춘다).
 */
export function emotionProximity(value: number, rise: readonly [number, number]): number {
  const [firstThreshold] = rise
  if (value < firstThreshold) return (value / firstThreshold) * 50
  return Math.min(100, 50 + (value - firstThreshold))
}

/** 출연자의 근접도: 감정 중 가장 높은 값. 이탈했거나 감정이 없으면 null */
export function actorProximity(actor: ActorView): number | null {
  if (actor.walkedOut || actor.emotions.length === 0) return null
  return Math.max(...actor.emotions.map((emotion) => emotionProximity(emotion.value, emotion.rise)))
}

export type ShiftSize = '조금' | '꽤' | '크게'

/** 감정 변화량의 크기 말. 부호는 보지 않는다 */
export function shiftSize(amount: number, some: number = tuned('SHIFT_SIZE_SOME'), big: number = tuned('SHIFT_SIZE_BIG')): ShiftSize {
  const size = Math.abs(amount)
  if (size >= big) return '크게'
  if (size >= some) return '꽤'
  return '조금'
}

/** '짜증 ▼ 크게' 형태의 문구. rising은 감정이 오르는 변화인지 */
export function formatMoodShift(shift: MoodShift, emotionName: string): { text: string; rising: boolean } {
  const rising = shift.amount > 0
  return { text: `${emotionName} ${rising ? '▲' : '▼'} ${shiftSize(shift.amount)}`, rising }
}

/** 감정을 키우는 이유 상위 몇 개. relief와 음수 이유는 건너뛴다 */
export function topReasons(
  emotion: EmotionView,
  nameOf: (id: string) => string,
  count = 3,
): { text: string; amount: number }[] {
  return emotion.reasons
    .filter((reason) => reason.source.type !== 'relief' && reason.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, count)
    .map((reason) => ({ text: reasonNoun(reason, nameOf), amount: Math.round(reason.amount) }))
}
