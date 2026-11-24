import { isAlive, type Entity } from '@/kit/core/entity'
import { wordLookup } from '@/game/build/build'
import { PLAYER_ID } from '@/game/content/characters'
import type { CombatEvent } from '@/game/combat/events'
import { type ClauseHooks, lingeringMods, resolveClause, type ResolvedClause } from '@/game/resolve/resolve'
import type { Board } from '@/game/sentence/board'
import type { RallyState } from './combat'

/** 절 하나의 실행과 승패 판정(내 낭독과 적 차례가 함께 쓴다). */

export function outcomeOf(entities: readonly Entity[]): 'won' | 'lost' | null {
  const player = entities.find((e) => e.id === PLAYER_ID)
  if (!player || !isAlive(player)) return 'lost'
  return entities.some((e) => e.side === 'enemy' && isAlive(e)) ? null : 'won'
}

export function isAliveEnemy(state: RallyState, id: string): boolean {
  const entity = state.entities.find((e) => e.id === id)
  return entity !== undefined && entity.side === 'enemy' && isAlive(entity)
}

export function enemyDamageTaken(events: readonly CombatEvent[], entities: readonly Entity[]): number {
  const enemyIds = new Set(entities.filter((e) => e.side === 'enemy').map((e) => e.id))
  return events.reduce(
    (sum, e) => ((e.type === 'damaged' || e.type === 'hpLost') && enemyIds.has(e.entityId) ? sum + e.amount : sum),
    0,
  )
}

/** 절 하나를 실행한다. 내 절은 강화(lookup)와 빌드 훅, 적 절은 층 배율 훅을 받는다. */
export function runClause(
  state: RallyState,
  board: Board,
  clause: number,
  hooks: ClauseHooks,
  side: 'player' | 'enemy',
): { state: RallyState; events: CombatEvent[]; targets: ResolvedClause['targets'] } {
  let nextId = state.nextId
  const lookup = side === 'player' ? wordLookup(state.build) : undefined
  // 적 절에는 개체에 남은 형용사 상태를 넘긴다. 남은 형용사는 내 카드라 내 빌드(강화)로 읽는다.
  const playerLookup = wordLookup(state.build)
  const lingering = side === 'enemy' ? (id: string) => lingeringMods(state.lingering[id] ?? [], playerLookup) : undefined
  const r = resolveClause(board, clause, state.entities, () => `t${nextId++}`, { executions: state.executions, lookup, hooks, lingering })
  return { state: { ...state, entities: r.entities, nextId, executions: state.executions + 1 }, events: r.events, targets: r.targets }
}
