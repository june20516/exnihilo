import { COMMON_EMOTIONS, type CommonEmotionId } from '@/content/types'
import type { LogLine } from '@/sim/engine'

/** 연쇄 깊이 한 단계의 들여쓰기(px) */
const LOG_INDENT_PX = 12
/** 들여쓰기를 멈추는 연쇄 깊이(좁은 열에서 문장이 사라지지 않게) */
const LOG_INDENT_MAX_LEVEL = 4

/** 연쇄 깊이의 들여쓰기(px). 상한 단계에서 멈춘다. */
export function logIndent(depth: number): number {
  return Math.max(0, Math.min(depth, LOG_INDENT_MAX_LEVEL) - 1) * LOG_INDENT_PX
}

/** 공용 감정의 단계 줄 색. 개인 감정은 LOG_PERSONAL_EMOTION_COLOR */
const LOG_STAGE_COLORS: Record<CommonEmotionId, string> = {
  irritation: 'text-red-300',
  excitement: 'text-amber-300',
  anxiety: 'text-sky-300',
  boredom: 'text-slate-400',
}
const LOG_PERSONAL_EMOTION_COLOR = 'text-violet-300'

function isCommonEmotion(emotion: string): emotion is CommonEmotionId {
  return (COMMON_EMOTIONS as readonly string[]).includes(emotion)
}

function stageColor(emotion: string | null): string {
  return emotion !== null && isCommonEmotion(emotion)
    ? LOG_STAGE_COLORS[emotion]
    : LOG_PERSONAL_EMOTION_COLOR
}

/**
 * 줄 종류에 따른 글씨 스타일. staff와 silence는 로그의 기본 색을 그대로 쓴다.
 * 버릇은 이탤릭으로 눕혀 사건·감정 줄보다 한 단계 낮은 배경 소리로 읽히게 한다.
 */
export function logTextClass(line: LogLine): string {
  switch (line.kind) {
    case 'habit':
      return 'italic text-slate-500'
    case 'stage':
      return stageColor(line.emotion)
    case 'incident':
      return 'font-semibold'
    default:
      return ''
  }
}

/**
 * 자동 슬로모션 계기 사건이 이 줄(묶인 줄이면 첫~마지막 사건 사이)에 속하는지.
 * 가정: 묶인 줄 사이에 줄을 남기지 않는 강도 1 이상 사건이 끼지 않는다(버릇·터짐은 줄 하나에
 * 사건 하나만 대표하고, 기척은 슬로모션 계기가 아니다). 그래서 id 범위가 곧 그 줄의 사건들이다.
 */
export function containsEvent(line: LogLine, eventId: number | null): boolean {
  const { eventId: first, lastEventId: last } = line
  if (eventId === null || first === null || last === null) return false
  return first <= eventId && eventId <= last
}
