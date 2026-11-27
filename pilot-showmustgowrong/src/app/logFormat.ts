import type { LogLine } from '@/sim/engine'

/** 연쇄 깊이 한 단계의 들여쓰기(px) */
const LOG_INDENT_PX = 12
/** 들여쓰기를 멈추는 연쇄 깊이(좁은 열에서 문장이 사라지지 않게) */
const LOG_INDENT_MAX_LEVEL = 4

/** 연쇄 깊이의 들여쓰기(px). 상한 단계에서 멈춘다. */
export function logIndent(depth: number): number {
  return Math.max(0, Math.min(depth, LOG_INDENT_MAX_LEVEL) - 1) * LOG_INDENT_PX
}

/** 로그 줄의 보이는 단(spec 8절): 3 사고(가장 강함), 2 감정 단계 진입, 1 버릇·정적·스태프(가장 약함) */
export type LogTier = 1 | 2 | 3

export function logTier(line: LogLine): LogTier {
  switch (line.kind) {
    case 'incident':
      return 3
    case 'stage':
      return 2
    default:
      return 1
  }
}

/** 정적 줄의 회청색(버릇·스태프의 회색과 구분한다) */
const SILENCE_TEXT_COLOR = 'text-[#7C8DA6]'

/**
 * 줄 종류에 따른 글씨 스타일(색은 감정 색을 inline으로 주는 단계 줄 말고 여기서 정한다).
 * 1단은 흐린 기울임, 2단 2단계 진입은 굵게, 3단은 흰 굵은 글이다.
 */
export function logTextClass(line: LogLine): string {
  switch (line.kind) {
    case 'habit':
    case 'staff':
      return 'italic text-slate-500'
    case 'silence':
      return `italic ${SILENCE_TEXT_COLOR}`
    case 'stage':
      return line.stage === 2 ? 'font-bold' : ''
    case 'incident':
      return 'font-bold text-white'
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
