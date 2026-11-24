import { nextInt } from '@/kit/core/rng'
import type { Policy, SimGame } from '@/kit/sim/simulate'
import { BASIC_VERB_INSTANCE, type RallyAction, type RallyState } from '@/game/rally/combat'
import { getWord, type WordId } from '@/game/content/words'
import { PLAYER_ID } from '@/game/content/characters'
import { isFinisher, type SimCombatAction } from './combatGame'

type CombatPolicy = Policy<RallyState, SimCombatAction>
type CombatSim = SimGame<RallyState, SimCombatAction>

const ENEMY_HP_WEIGHT = 1.5
/** 다음 턴까지 이월되는 보호의 가치(HP 대비). */
const BLOCK_WEIGHT = 0.5
const OUTCOME_BONUS = 1000

/** 상태 평가: 내 HP·보호는 높게, 적 HP·보호는 낮게, 승패는 압도적으로. */
export function scoreState(state: RallyState): number {
  const player = state.entities.find((e) => e.id === PLAYER_ID)
  const playerValue = player ? player.hp + BLOCK_WEIGHT * player.statuses.block : 0
  const enemyValue = state.entities
    .filter((e) => e.side === 'enemy')
    .reduce((sum, e) => sum + e.hp + BLOCK_WEIGHT * e.statuses.block, 0)
  const outcome = state.phase === 'won' ? OUTCOME_BONUS : state.phase === 'lost' ? -OUTCOME_BONUS : 0
  return playerValue - ENEMY_HP_WEIGHT * enemyValue + outcome
}

/** 이 상태에서 턴을 마무리하는 가장 좋은 방법(턴 종료 또는 낭독)과 그 점수. */
function bestFinish(game: CombatSim, state: RallyState): { action: SimCombatAction; score: number } {
  const finishers = game.legalActions(state).filter(isFinisher)
  let best = { action: finishers[0], score: Number.NEGATIVE_INFINITY }
  for (const finisher of finishers) {
    const score = scoreState(game.apply(state, finisher))
    if (score > best.score) best = { action: finisher, score }
  }
  return best
}

/** 마무리를 포함해 각 행동의 한 수 앞 점수. 첫 항목은 "지금 마무리"다. */
export function scoreCandidates(game: CombatSim, state: RallyState): { action: SimCombatAction; score: number }[] {
  const baseline = bestFinish(game, state)
  const candidates = game.legalActions(state).filter((a) => !isFinisher(a))
  return [baseline, ...candidates.map((action) => ({ action, score: bestFinish(game, game.apply(state, action)).score }))]
}

/** 기준선: 아무것도 하지 않는다. */
export const passiveBot: CombatPolicy = (game, state, rng) => {
  const end = game.legalActions(state).find((a) => a.action.type === 'endTurn')
  if (!end) throw new Error('합법 행동에 턴 종료가 없습니다.')
  return [end, rng]
}

/** 합법 행동 중 균등하게 고른다. */
export const randomBot: CombatPolicy = (game, state, rng) => {
  const legal = game.legalActions(state)
  const [index, next] = nextInt(rng, 0, legal.length - 1)
  return [legal[index], next]
}

/**
 * 한 수 앞을 본다: 각 후보를 둔 뒤 가장 좋게 마무리한 결과를 평가해, 지금 마무리하는 것보다 나으면 그 수를 둔다.
 * 한계: 무작위 결과인 추가 드로우의 가치는 볼 수 없다.
 */
export const greedyBot: CombatPolicy = (game, state, rng) => {
  const [baseline, ...candidates] = scoreCandidates(game, state)
  const best = candidates.reduce((top, c) => (c.score > top.score ? c : top), baseline)
  return [best.action, rng]
}

/** 때리기만 하는 봇이 고를 수 있는 동사인가: 피해 동작(damage, mutualDamage)만 가진 동사. */
function isDamageOnlyVerb(wordId: WordId): boolean {
  const effect = getWord(wordId).effect
  if (effect.type !== 'verb') return true
  return effect.actions.length > 0 && effect.actions.every((a) => a.kind === 'damage' || a.kind === 'mutualDamage')
}

/**
 * "때리기만 하는 봇"(v3 판정 지표)이 둘 수 있는 행동인가. 단어 id가 아니라 정의의 동작 종류로 판정한다.
 * 동사 배치는 피해 동작만 가진 동사(기본 동사 포함)일 때만 허용한다. 보호·상태·떠올리기·되받아친다는 쓰지 않는다.
 * 동사가 아닌 단어(대상·형용사·부사·연결어)와 대상 지정·낭독·턴 종료 등은 허용한다.
 */
export function isAttackOnlyAction(state: RallyState, action: RallyAction): boolean {
  if (action.type !== 'place') return true
  const wordId =
    action.instanceId === BASIC_VERB_INSTANCE ? state.build.basicVerb : state.deck.hand.find((c) => c.instanceId === action.instanceId)?.wordId
  return wordId === undefined || isDamageOnlyVerb(wordId)
}

/** 합법 행동을 때리기만 하는 행동으로 거른 게임(전투 게이트용). */
export function attackOnlyGame(game: CombatSim): CombatSim {
  return { ...game, legalActions: (state) => game.legalActions(state).filter((a) => isAttackOnlyAction(state, a.action)) }
}
