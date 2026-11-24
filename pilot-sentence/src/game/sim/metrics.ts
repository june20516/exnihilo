import type { SimGame } from '@/kit/sim/simulate'
import { type RallyState } from '@/game/rally/combat'
import { PLAYER_ID } from '@/game/content/characters'
import { previewRound } from '@/game/rally/preview'
import { scoreCandidates } from './bots'
import { isFinisher, type SimCombatAction } from './combatGame'

export const MAX_SIM_TURNS = 30
/** 1위와 2위 점수 차가 이 이상이면 "뻔한 최선"으로 본다. */
export const OBVIOUS_GAP = 10

/** 전투가 끝난 시점의 지표 (v2 spec §7). */
export function combatMetrics(state: RallyState): Record<string, number> {
  const player = state.entities.find((e) => e.id === PLAYER_ID)
  const { casts, defensiveCasts, basicVerbCasts, emptyDrawHpLost, recalledCards, bestBurst } = state.log
  return {
    hpLost: player ? player.maxHp - player.hp : 0,
    turns: state.turn,
    basicVerbRate: casts === 0 ? 0 : basicVerbCasts / casts,
    emptyDrawHpLost,
    recalledCards,
    defendRate: casts === 0 ? 0 : defensiveCasts / casts,
    bestBurst,
  }
}

function previewKey(state: RallyState): string {
  const { mine, enemy } = previewRound(state)
  return [...mine, ...enemy].map((l) => l.text).join('|')
}

/** 턴 시작 시점 지표. */
export function combatTurnMetrics(game: SimGame<RallyState, SimCombatAction>) {
  return (state: RallyState): Record<string, number> => {
    const actions = game.legalActions(state).filter((a) => !isFinisher(a))
    const outcomes = new Set([previewKey(state), ...actions.map((a) => previewKey(game.apply(state, a)))])
    const scores = scoreCandidates(game, state).map((c) => c.score).sort((a, b) => b - a)
    return {
      choiceDiversity: outcomes.size,
      obviousBest: scores.length >= 2 && scores[0] - scores[1] >= OBVIOUS_GAP ? 1 : 0,
    }
  }
}
