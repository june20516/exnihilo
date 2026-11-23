import { BALANCE } from '@/game/content/balance'
import { type CombatState, reduceCombat, turnsUntilEnemyCast } from './combat'
import type { CombatEvent } from './events'
import { linesFromEvents, type PreviewLine } from '@/game/rally/lines'

export { linesFromEvents, type PreviewLine }

/** 문장 실행 구간이 끝났음을 뜻하는 이벤트(이후는 건조·상태 처리·다음 턴). */
const AFTER_EXECUTION: readonly CombatEvent['type'][] = ['dried', 'poisonTick', 'intentRevealed', 'resourceGained', 'combatEnded']

/**
 * 실제 이벤트 목록에서 한 번의 실행 구간을 잘라낸다.
 * by가 주어지면 그 주체의 낭독(cast) 뒤 구간, 아니면 첫 절 실행부터.
 */
export function executionSegment(events: readonly CombatEvent[], by?: 'player' | 'enemy'): CombatEvent[] {
  const startIndex = by
    ? events.findIndex((e) => e.type === 'cast' && e.by === by) + 1
    : events.findIndex((e) => e.type === 'clauseExecuted')
  if (startIndex <= 0 && !(startIndex === 0 && !by)) return []
  const rest = events.slice(startIndex)
  const end = rest.findIndex((e) => AFTER_EXECUTION.includes(e.type) || e.type === 'cast' || e.type === 'intervention')
  return end < 0 ? rest : rest.slice(0, end)
}

/**
 * 지금 상태로 실행되면 일어날 일. 실제 reducer를 상태 사본에 돌린 결과에서 실행 구간만 보여 주므로 실제와 어긋나지 않는다.
 * 자동 실행 프리셋은 턴 종료(개입 반영), 낭독 프리셋은 "지금 낭독하면"(그 턴에 적도 낭독하면 이어서)이다.
 */
export function previewExecution(state: CombatState): PreviewLine[] {
  if (state.rules.execution === 'auto') {
    const r = reduceCombat(state, { type: 'endTurn' }, BALANCE)
    return linesFromEvents(executionSegment(r.events), r.state.entities)
  }
  const r = reduceCombat(state, { type: 'cast' }, BALANCE)
  const mine = linesFromEvents(executionSegment(r.events, 'player'), r.state.entities)
  if (!r.events.some((e) => e.type === 'cast' && e.by === 'enemy')) return mine
  const enemy = linesFromEvents(executionSegment(r.events, 'enemy'), r.state.entities)
  return [...mine, { text: '— 이어서 적이 낭독 —', tone: 'neutral' }, ...enemy]
}

/** 낭독 프리셋에서 낭독 없이 턴을 끝냈을 때 적이 낭독하면 일어날 일(개입 반영). 적이 낭독하지 않는 턴이면 null. */
export function previewEnemyCast(state: CombatState): PreviewLine[] | null {
  if (state.rules.execution !== 'cast' || turnsUntilEnemyCast(state) !== 1) return null
  const r = reduceCombat(state, { type: 'endTurn' }, BALANCE)
  return linesFromEvents(executionSegment(r.events, 'enemy'), r.state.entities)
}
