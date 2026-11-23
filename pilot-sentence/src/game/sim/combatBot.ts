import type { Balance } from '@/game/content/balance'
import { type RallyAction, type RallyState, reduceRally } from '@/game/rally/combat'
import { hasVerb } from '@/game/rally/sentence'
import { scoreState } from './bots'
import { legalCombatActions } from './combatGame'

/** 한 수 앞 점수로 고른 뒤 두 번째 수까지 볼 후보 수. 연결어(connect) 후보는 이와 별도로 모두 본다. */
const TOP_K = 5
const END_TURN: RallyAction = { type: 'endTurn' }
const CAST: RallyAction = { type: 'cast' }

function apply(state: RallyState, action: RallyAction, balance: Balance): RallyState {
  return reduceRally(state, action, balance).state
}

/** 지금 마무리(낭독 또는 턴 종료)했을 때의 가장 좋은 점수와 그 행동. */
function bestFinish(state: RallyState, balance: Balance): { action: RallyAction; score: number } {
  const finishers = hasVerb(state.board) ? [CAST, END_TURN] : [END_TURN]
  let best = { action: END_TURN, score: Number.NEGATIVE_INFINITY }
  for (const action of finishers) {
    const score = scoreState(apply(state, action, balance))
    if (score > best.score) best = { action, score }
  }
  return best
}

/** 마무리가 아닌 후보. 버리기는 뽑을 카드를 미리 보게 되므로(결정적 시뮬레이션) 고르지 않는다. */
function steps(state: RallyState, balance: Balance): { action: RallyAction; next: RallyState }[] {
  return legalCombatActions(state, balance)
    .map((a) => a.action)
    .filter((a) => a.type !== 'cast' && a.type !== 'endTurn' && a.type !== 'discard')
    .map((action) => ({ action, next: apply(state, action, balance) }))
    .filter((s) => s.next !== state)
}

/**
 * 두 수 앞 탐욕 봇(런 spec §7.1). 한 수 앞 점수로 상위 후보를 고르고, 연결어 후보와 함께 둘째 배치까지 본다.
 * 그 결과가 지금 마무리하는 것보다 나으면 첫 수를 두고, 아니면 마무리한다.
 */
export function twoPlyBot(state: RallyState, balance: Balance): RallyAction {
  if (state.phase !== 'player') return END_TURN
  const now = bestFinish(state, balance)
  const first = steps(state, balance).map((s) => ({ ...s, score: bestFinish(s.next, balance).score }))
  const ranked = [...first].sort((a, b) => b.score - a.score)
  const explored = [...ranked.slice(0, TOP_K), ...ranked.slice(TOP_K).filter((s) => s.action.type === 'connect')]
  let best = { action: now.action, score: now.score }
  for (const candidate of explored) {
    let value = candidate.score
    for (const second of steps(candidate.next, balance)) value = Math.max(value, bestFinish(second.next, balance).score)
    if (value > best.score) best = { action: candidate.action, score: value }
  }
  return best.action
}
