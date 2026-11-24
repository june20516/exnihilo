import { CHARACTERS, DEFAULT_CHARACTER } from '@/game/content/characters'
import type { SimGame } from '@/kit/sim/simulate'
import { getWord, type WordId } from '@/game/content/words'
import { BASIC_VERB_INSTANCE, basicVerbAvailable, type RallyAction, type RallyState, reduceRally, startRally } from '@/game/rally/combat'
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

function isAccepted(state: RallyState, action: RallyAction): boolean {
  const first = reduceRally(state, action).events[0]
  return first !== undefined && first.type !== 'rejected'
}

/** 손패 카드 한 장을 놓을 수 있는 모든 방법. 같은 단어 카드는 결과가 같으므로 호출자가 단어당 한 장만 넘긴다. */
export function placementsFor(state: RallyState, instanceId: string, wordId: WordId): SimCombatAction[] {
  const def = getWord(wordId)
  const isModifier = def.kind === 'adjective' || def.kind === 'adverb'
  const actions: SimCombatAction[] = []
  state.board.clauses.forEach((clause, clauseIndex) => {
    for (const slot of clause.slots) {
      const at = { clause: clauseIndex, role: slot.role }
      const positions: (number | undefined)[] = isModifier ? slot.modifiers.map((_, i) => i) : [undefined]
      for (const modifierIndex of positions) {
        const action: RallyAction = { type: 'place', instanceId, at, modifierIndex }
        if (!isAccepted(state, action)) continue
        const where = `${clauseIndex}:${slot.role}${modifierIndex === undefined ? '' : `:m${modifierIndex}`}`
        actions.push({ action, key: `place:${wordId}@${where}` })
      }
    }
  })
  return actions
}

/** 지금 상태의 합법 행동(같은 단어는 한 장만). 연결어 카드는 connect로 나온다. */
export function legalCombatActions(state: RallyState): SimCombatAction[] {
  if (state.phase !== 'player') return [END_TURN]
  const actions: SimCombatAction[] = []
  const seenWords = new Set<WordId>()
  for (const card of state.deck.hand) {
    if (seenWords.has(card.wordId)) continue
    seenWords.add(card.wordId)
    if (getWord(card.wordId).kind === 'connective') {
      actions.push({ action: { type: 'connect', instanceId: card.instanceId }, key: `connect:${card.wordId}` })
    } else {
      actions.push(...placementsFor(state, card.instanceId, card.wordId))
    }
    if (state.discardsLeft > 0) actions.push({ action: { type: 'discard', instanceIds: [card.instanceId] }, key: `discard:${card.wordId}` })
  }
  for (const enemy of state.entities) {
    if (enemy.side !== 'enemy' || enemy.hp <= 0 || enemy.id === state.targetId) continue
    actions.push({ action: { type: 'target', entityId: enemy.id }, key: `target:${enemy.id}` })
  }
  if (basicVerbAvailable(state)) actions.push(...placementsFor(state, BASIC_VERB_INSTANCE, state.build.basicVerb))
  if (hasVerb(state.board)) actions.push({ action: { type: 'cast' }, key: 'cast' })
  return [...actions, END_TURN]
}

export function combatGame(
  encounterId: string,
  deck: readonly WordId[] = CHARACTERS[DEFAULT_CHARACTER].starterDeck,
): SimGame<RallyState, SimCombatAction> {
  return {
    start: (seed) => startRally(encounterId, deck, seed).state,
    apply: (state, a) => reduceRally(state, a.action).state,
    legalActions: (state) => legalCombatActions(state),
    outcome: (state) => (state.phase === 'player' ? null : state.phase),
    turn: (state) => state.turn,
    actionKey: (a) => a.key,
  }
}
