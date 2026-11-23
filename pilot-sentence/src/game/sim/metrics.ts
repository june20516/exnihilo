import type { SimGame } from '@/kit/sim/simulate'
import { BALANCE } from '@/game/content/balance'
import { type CombatState, PLAYER_ID } from '@/game/combat/combat'
import { previewExecution } from '@/game/combat/preview'
import { scoreCandidates } from './bots'
import { isFinisher, placementsFor, type SimCombatAction } from './combatGame'

export const MAX_SIM_TURNS = 30
/** 1위와 2위 점수 차가 이 이상이면 "뻔한 최선"으로 본다. */
export const OBVIOUS_GAP = 10

export function combatMetrics(state: CombatState): Record<string, number> {
  const player = state.entities.find((e) => e.id === PLAYER_ID)
  return { hpLost: player ? player.maxHp - player.hp : 0, turns: state.turn }
}

function previewKey(state: CombatState): string {
  return previewExecution(state).map((l) => l.text).join('|')
}

/** 턴 시작 시점 지표 (spec 10.7). */
export function combatTurnMetrics(game: SimGame<CombatState, SimCombatAction>) {
  return (state: CombatState): Record<string, number> => {
    const hand = state.deck.hand
    const unplayable = hand.filter((c) => placementsFor(state, c.instanceId, c.wordId, BALANCE).length === 0).length
    const actions = game.legalActions(state).filter((a) => !isFinisher(a))
    const outcomes = new Set([previewKey(state), ...actions.map((a) => previewKey(game.apply(state, a)))])
    const scores = scoreCandidates(game, state).map((c) => c.score).sort((a, b) => b - a)
    const obviousBest = scores.length >= 2 && scores[0] - scores[1] >= OBVIOUS_GAP ? 1 : 0
    return {
      unplayableRate: hand.length === 0 ? 0 : unplayable / hand.length,
      choiceDiversity: outcomes.size,
      obviousBest,
    }
  }
}
