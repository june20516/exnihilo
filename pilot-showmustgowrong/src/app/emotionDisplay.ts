import { tuned } from '@/content/tuning'
import { COMMON_EMOTIONS, type MoodShift } from '@/content/types'
import type { ActorView } from '@/sim/engineTypes'
import type { EmotionView, MoodView } from '@/sim/life'
import { reasonNoun } from '@/sim/narration'

/**
 * 감정 값을 "다음 단계까지 얼마나 가까운가"(0~100)로 바꾼다.
 * 구간별 직선: [0,r1]→[0,50], [r1,r2]→[50,80], [r2,100]→[80,100].
 * 입력과 결과는 0~100으로 자르고, 폭이 0 이하인 구간은 건너뛴다(0으로 나누지 않는다).
 */
export function emotionProximity(value: number, rise: readonly [number, number]): number {
  const clamped = clamp(value, 0, 100)
  if (clamped === 100) return 100
  const first = clamp(rise[0], 0, 100)
  const second = clamp(rise[1], first, 100)
  const knots: readonly (readonly [number, number])[] = [
    [0, 0],
    [first, 50],
    [second, 80],
    [100, 100],
  ]
  for (let index = 1; index < knots.length; index++) {
    const [fromValue, fromScore] = knots[index - 1]
    const [toValue, toScore] = knots[index]
    if (toValue <= fromValue || clamped > toValue) continue
    return clamp(fromScore + ((clamped - fromValue) / (toValue - fromValue)) * (toScore - fromScore), 0, 100)
  }
  return 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
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

/** 감정을 키우는 이유 상위 몇 개. relief와 음수 이유, 반올림하면 0인 이유("+0"으로 보인다)는 건너뛴다 */
export function topReasons(
  emotion: EmotionView,
  nameOf: (id: string) => string,
  count = 3,
): { text: string; amount: number }[] {
  return emotion.reasons
    .filter((reason) => reason.source.type !== 'relief' && reason.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((reason) => ({ text: reasonNoun(reason, nameOf), amount: Math.round(reason.amount) }))
    .filter((reason) => reason.amount > 0)
    .slice(0, count)
}

/** 대표 감정 문구: "짜증 · 짜증 남". 단계 이름이 없거나 감정 이름과 같으면 감정 이름만. 감정이 없으면 null */
export function moodLabel(mood: MoodView | null): string | null {
  if (mood === null) return null
  return mood.stageName === null || mood.stageName === mood.name ? mood.name : `${mood.name} · ${mood.stageName}`
}

/** 공용 감정(막대 위쪽 묶음)인지. 아니면 개인 감정 */
export function isCommon(emotion: EmotionView): boolean {
  return (COMMON_EMOTIONS as readonly string[]).includes(emotion.id)
}
