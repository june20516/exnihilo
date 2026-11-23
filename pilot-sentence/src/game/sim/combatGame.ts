import type { SimGame } from '@/kit/sim/simulate'
import type { Balance } from '@/game/content/balance'
import { STARTER_DECK } from '@/game/content/encounters'
import { getWord } from '@/game/content/words'
import { type CombatAction, type CombatState, reduceCombat, startCombat } from '@/game/combat/combat'

/** 시뮬레이터용 행동: 엔진 행동과 집계 키(예: `place:bite@0:verb`). */
export interface SimCombatAction {
  readonly action: CombatAction
  readonly key: string
}

const END_TURN: SimCombatAction = { action: { type: 'endTurn' }, key: 'endTurn' }

function isAccepted(state: CombatState, action: CombatAction, balance: Balance): boolean {
  const first = reduceCombat(state, action, balance).events[0]
  return first !== undefined && first.type !== 'rejected'
}

/** 놓을 수 있는 모든 배치 + 턴 종료. 같은 단어 카드는 결과가 같으므로 단어당 한 장만 본다. */
function legalActions(state: CombatState, balance: Balance): SimCombatAction[] {
  if (state.phase !== 'player') return [END_TURN]
  const seenWords = new Set<string>()
  const enemies = state.entities.filter((e) => e.side === 'enemy' && e.hp > 0)
  const actions: SimCombatAction[] = []

  for (const card of state.deck.hand) {
    if (seenWords.has(card.wordId)) continue
    seenWords.add(card.wordId)
    const def = getWord(card.wordId)
    const isModifier = def.kind === 'adjective' || def.kind === 'adverb'
    const targets =
      def.effect.type === 'target' && def.effect.ref.kind === 'chosenEnemy' ? enemies.map((e) => e.id) : [undefined]

    state.board.clauses.forEach((clause, clauseIndex) => {
      for (const slot of clause.slots) {
        const at = { clause: clauseIndex, role: slot.role }
        // head 단어는 head 위치만, 수식어 단어는 칸을 명시한 위치만 본다(같은 수를 두 번 세지 않도록).
        const positions: (number | undefined)[] = isModifier ? slot.modifiers.map((_, i) => i) : [undefined]
        for (const modifierIndex of positions) {
          for (const targetEntityId of targets) {
            const action: CombatAction = { type: 'place', instanceId: card.instanceId, at, modifierIndex, targetEntityId }
            if (!isAccepted(state, action, balance)) continue
            const where = `${clauseIndex}:${slot.role}${modifierIndex === undefined ? '' : `:m${modifierIndex}`}`
            actions.push({ action, key: `place:${card.wordId}@${where}` })
          }
        }
      }
    })
  }
  return [...actions, END_TURN]
}

export function combatGame(encounterId: string, balance: Balance): SimGame<CombatState, SimCombatAction> {
  return {
    start: (seed) => startCombat(encounterId, STARTER_DECK, seed, balance).state,
    apply: (state, a) => reduceCombat(state, a.action, balance).state,
    legalActions: (state) => legalActions(state, balance),
    outcome: (state) => (state.phase === 'player' ? null : state.phase),
    turn: (state) => state.turn,
    actionKey: (a) => a.key,
  }
}
