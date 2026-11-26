import type { LogLine } from '@/sim/engine'

/** 연쇄 깊이 한 단계의 들여쓰기(px) */
const LOG_INDENT_PX = 12
/** 들여쓰기를 멈추는 연쇄 깊이(좁은 열에서 문장이 사라지지 않게) */
const LOG_INDENT_MAX_LEVEL = 4

/** 연쇄 깊이의 들여쓰기(px). 상한 단계에서 멈춘다. */
export function logIndent(depth: number): number {
  return Math.max(0, Math.min(depth, LOG_INDENT_MAX_LEVEL) - 1) * LOG_INDENT_PX
}

/** 단계 줄의 감정별 색. 목록에 없는 감정(개인 감정)은 LOG_PERSONAL_EMOTION_COLOR */
const LOG_STAGE_COLORS: Record<string, string> = {
  irritation: 'text-red-300',
  excitement: 'text-amber-300',
  anxiety: 'text-sky-300',
  boredom: 'text-slate-400',
}
const LOG_PERSONAL_EMOTION_COLOR = 'text-violet-300'

/** 줄 종류에 따른 글씨 스타일. staff와 silence는 로그의 기본 색을 그대로 쓴다. */
export function logTextClass(line: LogLine): string {
  switch (line.kind) {
    case 'habit':
      return 'text-slate-500'
    case 'stage':
      return (line.emotion !== null && LOG_STAGE_COLORS[line.emotion]) || LOG_PERSONAL_EMOTION_COLOR
    case 'incident':
      return 'font-semibold'
    default:
      return ''
  }
}

/** 자동 슬로모션 계기 사건이 이 줄(묶인 줄이면 첫~마지막 사건 사이)에 속하는지 */
export function containsEvent(line: LogLine, eventId: number | null): boolean {
  if (eventId === null || line.eventId === null) return false
  return line.eventId <= eventId && eventId <= (line.lastEventId ?? line.eventId)
}
