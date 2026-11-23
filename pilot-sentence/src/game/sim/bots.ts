import { nextInt } from '@/kit/core/rng'
import type { Policy } from '@/kit/sim/simulate'
import { type CombatState, PLAYER_ID } from '@/game/combat/combat'
import type { SimCombatAction } from './combatGame'

type CombatPolicy = Policy<CombatState, SimCombatAction>

const ENEMY_HP_WEIGHT = 1.5
const OUTCOME_BONUS = 1000

/** 상태 평가: 내 HP는 높게, 적 HP는 낮게, 승패는 압도적으로. */
export function scoreState(state: CombatState): number {
  const playerHp = state.entities.find((e) => e.id === PLAYER_ID)?.hp ?? 0
  const enemyHp = state.entities.filter((e) => e.side === 'enemy').reduce((sum, e) => sum + e.hp, 0)
  const outcome = state.phase === 'won' ? OUTCOME_BONUS : state.phase === 'lost' ? -OUTCOME_BONUS : 0
  return playerHp - ENEMY_HP_WEIGHT * enemyHp + outcome
}

function endTurnOf(actions: readonly SimCombatAction[]): SimCombatAction {
  const end = actions.find((a) => a.action.type === 'endTurn')
  if (!end) throw new Error('합법 행동에 턴 종료가 없습니다.')
  return end
}

/** 기준선: 아무것도 하지 않는다. */
export const passiveBot: CombatPolicy = (game, state, rng) => [endTurnOf(game.legalActions(state)), rng]

/** 합법 행동 중 균등하게 고른다(턴 종료 포함). */
export const randomBot: CombatPolicy = (game, state, rng) => {
  const legal = game.legalActions(state)
  const [index, next] = nextInt(rng, 0, legal.length - 1)
  return [legal[index], next]
}

/**
 * 한 수 앞을 본다: 각 후보를 둔 뒤 턴을 끝낸 결과를 평가해, 지금 턴을 끝내는 것보다 나으면 그 수를 둔다.
 * 엔진이 순수 함수라 실제 상태를 건드리지 않고 미리 돌려 볼 수 있다.
 */
export const greedyBot: CombatPolicy = (game, state, rng) => {
  const legal = game.legalActions(state)
  const end = endTurnOf(legal)
  let best = end
  let bestScore = scoreState(game.apply(state, end))
  for (const candidate of legal) {
    if (candidate === end) continue
    const score = scoreState(game.apply(game.apply(state, candidate), end))
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return [best, rng]
}
