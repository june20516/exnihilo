import type { SimGame } from '@/kit/sim/simulate'
import type { Balance } from '@/game/content/balance'
import { RALLY_STARTER_DECK } from '@/game/content/enemies'
import { getWord, type WordId } from '@/game/content/words'
import { type RallyAction, type RallyState, reduceRally, startRally } from '@/game/rally/combat'
import { hasVerb } from '@/game/rally/sentence'

/** 시뮬레이터용 행동: 엔진 행동과 집계 키(예: `place:bite@0:verb`). */
export interface SimCombatAction {
  readonly action: RallyAction
  readonly key: string
}

export const END_TURN: SimCombatAction = { action: { type: 'endTurn' }, key: 'endTurn' }

export function isFinisher(a: SimCombatAction): boolean {
  return a.action.type === 'endTurn' || a.action.type === 'cast'
}

function isAccepted(state: RallyState, action: RallyAction, balance: Balance): boolean {
  const first = reduceRally(state, action, balance).events[0]
  return first !== undefined && first.type !== 'rejected'
}

/** 손패 카드 한 장을 놓을 수 있는 모든 방법. 같은 단어 카드는 결과가 같으므로 호출자가 단어당 한 장만 넘긴다. */
export function placementsFor(state: RallyState, instanceId: string, wordId: WordId, balance: Balance): SimCombatAction[] {
  const def = getWord(wordId)
  const isModifier = def.kind === 'adjective' || def.kind === 'adverb'
  const actions: SimCombatAction[] = []
  state.board.clauses.forEach((clause, clauseIndex) => {
    for (const slot of clause.slots) {
      const at = { clause: clauseIndex, role: slot.role }
      const positions: (number | undefined)[] = isModifier ? slot.modifiers.map((_, i) => i) : [undefined]
      for (const modifierIndex of positions) {
        const action: RallyAction = { type: 'place', instanceId, at, modifierIndex }
        if (!isAccepted(state, action, balance)) continue
        const where = `${clauseIndex}:${slot.role}${modifierIndex === undefined ? '' : `:m${modifierIndex}`}`
        actions.push({ action, key: `place:${wordId}@${where}` })
      }
    }
  })
  return actions
}

function legalActions(state: RallyState, balance: Balance): SimCombatAction[] {
  if (state.phase !== 'player') return [END_TURN]
  const actions: SimCombatAction[] = []
  const seenWords = new Set<WordId>()
  for (const card of state.deck.hand) {
    if (seenWords.has(card.wordId)) continue
    seenWords.add(card.wordId)
    actions.push(...placementsFor(state, card.instanceId, card.wordId, balance))
    if (state.discardsLeft > 0) actions.push({ action: { type: 'discard', instanceIds: [card.instanceId] }, key: `discard:${card.wordId}` })
  }
  for (const enemy of state.entities) {
    if (enemy.side !== 'enemy' || enemy.hp <= 0 || enemy.id === state.targetId) continue
    actions.push({ action: { type: 'target', entityId: enemy.id }, key: `target:${enemy.id}` })
  }
  if (hasVerb(state.board)) actions.push({ action: { type: 'cast' }, key: 'cast' })
  return [...actions, END_TURN]
}

export function combatGame(
  encounterId: string,
  balance: Balance,
  deck: readonly WordId[] = RALLY_STARTER_DECK,
): SimGame<RallyState, SimCombatAction> {
  return {
    start: (seed) => startRally(encounterId, deck, seed, balance).state,
    apply: (state, a) => reduceRally(state, a.action, balance).state,
    legalActions: (state) => legalActions(state, balance),
    outcome: (state) => (state.phase === 'player' ? null : state.phase),
    turn: (state) => state.turn,
    actionKey: (a) => a.key,
  }
}
