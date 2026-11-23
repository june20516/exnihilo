import type { Balance } from '@/game/content/balance'
import type { CombatEvent } from '@/game/combat/events'
import { type RallyState, reduceRally } from './combat'
import { linesFromEvents, type PreviewLine } from './lines'
import { hasVerb } from './sentence'

function segment(events: readonly CombatEvent[], startAfter: CombatEvent['type'], stopAt: readonly CombatEvent['type'][]): CombatEvent[] {
  const start = events.findIndex((e) => e.type === startAfter)
  if (start < 0) return []
  const rest = events.slice(start + 1)
  const end = rest.findIndex((e) => stopAt.includes(e.type))
  return end < 0 ? rest : rest.slice(0, end)
}

/**
 * 이번 라운드에 일어날 일을 실제 reducer를 상태 사본에 돌려 얻는다.
 * 동사가 있으면 낭독, 없으면 낭독 없이 턴 종료. mine은 내 낭독, enemy는 이어지는 적의 차례.
 */
export function previewEvents(state: RallyState, balance: Balance): { mine: CombatEvent[]; enemy: CombatEvent[]; after: RallyState } {
  const r = reduceRally(state, { type: hasVerb(state.board) ? 'cast' : 'endTurn' }, balance)
  return {
    mine: segment(r.events, 'cast', ['enemyTurn', 'combatEnded']),
    enemy: segment(r.events, 'enemyTurn', ['drawn', 'combatEnded']),
    after: r.state,
  }
}

export function previewRound(state: RallyState, balance: Balance): { mine: PreviewLine[]; enemy: PreviewLine[] } {
  const { mine, enemy, after } = previewEvents(state, balance)
  return { mine: linesFromEvents(mine, after.entities), enemy: linesFromEvents(enemy, after.entities) }
}
