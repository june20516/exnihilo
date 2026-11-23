import { createEntity, type Entity, isAlive, tickEndOfTurn } from '@/kit/core/entity'
import type { Reduced } from '@/kit/core/reduced'
import { createRng, type RngState } from '@/kit/core/rng'
import {
  addToDiscard, type CardInstance, createDeck, type DeckState, discardHand, draw, takeFromHand,
} from '@/kit/deck/deck'
import type { Balance } from '@/game/content/balance'
import { ENCOUNTERS, type EncounterDef, type InterventionStep, type SlotAddress } from '@/game/content/encounters'
import { getWord, type WordId } from '@/game/content/words'
import { resolveClause } from '@/game/resolve/resolve'
import {
  type Board, buildBoard, dryInk, enemyAttach, enemyReplace, getSlot, placeWord, type PlacedWord, revertSlot, sealSlot,
} from '@/game/sentence/board'
import type { CombatEvent, RejectReason } from './events'

export interface CardInst extends CardInstance {
  readonly wordId: WordId
}

export interface CombatState {
  readonly encounterId: string
  readonly turn: number
  readonly phase: 'player' | 'won' | 'lost'
  readonly entities: readonly Entity[]
  readonly board: Board
  readonly deck: DeckState<CardInst>
  readonly ap: number
  readonly loopIndex: number
  readonly rng: RngState
  readonly nextId: number
}

export type CombatAction =
  | {
      readonly type: 'place'
      readonly instanceId: string
      readonly at: SlotAddress
      readonly modifierIndex?: number
      readonly targetEntityId?: string
    }
  | { readonly type: 'endTurn' }

export const PLAYER_ID = 'p'

function getEncounter(id: string): EncounterDef {
  const encounter = ENCOUNTERS[id]
  if (!encounter) throw new Error(`알 수 없는 조우: ${id}`)
  return encounter
}

export function currentIntent(state: CombatState): InterventionStep {
  const loop = getEncounter(state.encounterId).interventionLoop
  return loop[state.loopIndex % loop.length]
}

function toCard(word: PlacedWord): CardInst | null {
  return word.owner === 'player' && word.instanceId ? { instanceId: word.instanceId, wordId: word.wordId } : null
}

function cardsFrom(words: readonly PlacedWord[]): CardInst[] {
  return words.map(toCard).filter((c): c is CardInst => c !== null)
}

function enemyWord(wordId: WordId): PlacedWord {
  return { wordId, owner: 'enemy', inkLeft: null, instanceId: null, targetEntityId: null }
}

function drawTurn(state: CombatState, balance: Balance): Reduced<CombatState, CombatEvent> {
  const r = draw(state.deck, balance.drawPerTurn, state.rng)
  return {
    state: { ...state, deck: r.deck, rng: r.rng, ap: balance.apPerTurn },
    events: [{ type: 'drawn', count: r.drawn.length, reshuffled: r.reshuffled }],
  }
}

export function startCombat(
  encounterId: string,
  deckWordIds: readonly WordId[],
  seed: number,
  balance: Balance,
): Reduced<CombatState, CombatEvent> {
  const encounter = getEncounter(encounterId)
  const player = createEntity({ id: PLAYER_ID, defId: 'player', name: '탐험가', side: 'ally', hp: balance.playerMaxHp })
  const enemies = encounter.enemies.map((spec, index) =>
    createEntity({ id: `e${index}`, defId: spec.defId, name: spec.name, side: 'enemy', hp: spec.hp, row: spec.row }),
  )
  const cards = deckWordIds.map((wordId, index) => ({ instanceId: `c${index}`, wordId }))
  const { deck, rng } = createDeck(cards, createRng(seed))
  const initial: CombatState = {
    encounterId,
    turn: 1,
    phase: 'player',
    entities: [player, ...enemies],
    board: buildBoard(encounter.initialSentence, balance.maxModifiers),
    deck,
    ap: balance.apPerTurn,
    loopIndex: 0,
    rng,
    nextId: cards.length,
  }
  const drawn = drawTurn(initial, balance)
  return {
    state: drawn.state,
    events: [...drawn.events, { type: 'intentRevealed', step: currentIntent(drawn.state) }],
  }
}

function reject(state: CombatState, reason: RejectReason, at: SlotAddress | null): Reduced<CombatState, CombatEvent> {
  return { state, events: [{ type: 'rejected', reason, at }] }
}

function chooseTarget(state: CombatState, requested: string | undefined): string | null {
  const aliveEnemies = state.entities.filter((e) => e.side === 'enemy' && isAlive(e))
  if (requested !== undefined) return aliveEnemies.some((e) => e.id === requested) ? requested : null
  return aliveEnemies.length === 1 ? aliveEnemies[0].id : null
}

function place(
  state: CombatState,
  action: Extract<CombatAction, { type: 'place' }>,
  balance: Balance,
): Reduced<CombatState, CombatEvent> {
  const { at } = action
  if (state.phase !== 'player') return reject(state, 'notPlayerTurn', at)
  const card = state.deck.hand.find((c) => c.instanceId === action.instanceId)
  if (!card) return reject(state, 'unplayable', at)
  const def = getWord(card.wordId)
  if (def.cost === null) return reject(state, 'unplayable', at)
  const cost = def.cost + (getSlot(state.board, at).sealed ? balance.sealExtraCost : 0)
  if (cost > state.ap) return reject(state, 'notEnoughAp', at)

  let targetEntityId: string | null = null
  if (def.effect.type === 'target' && def.effect.ref.kind === 'chosenEnemy') {
    targetEntityId = chooseTarget(state, action.targetEntityId)
    if (!targetEntityId) return reject(state, 'noTarget', at)
  }

  const placed: PlacedWord = {
    wordId: card.wordId, owner: 'player', inkLeft: def.ink, instanceId: card.instanceId, targetEntityId,
  }
  const result = placeWord(state.board, at, placed, action.modifierIndex)
  if (!result.ok) return reject(state, result.reason, at)

  const taken = takeFromHand(state.deck, card.instanceId)
  if (!taken) return reject(state, 'unplayable', at)
  const modifierIndex =
    def.kind === 'adjective' || def.kind === 'adverb'
      ? getSlot(result.board, at).modifiers.findIndex((m) => m?.instanceId === card.instanceId)
      : null
  return {
    state: {
      ...state,
      board: result.board,
      deck: addToDiscard(taken.deck, cardsFrom(result.displaced)),
      ap: state.ap - cost,
    },
    events: [
      { type: 'placed', at, wordId: card.wordId, modifierIndex },
      { type: 'apSpent', amount: cost },
    ],
  }
}

function applyIntervention(state: CombatState, step: InterventionStep): CombatState {
  switch (step.kind) {
    case 'revert': {
      const r = revertSlot(state.board, step.at)
      return { ...state, board: r.board, deck: addToDiscard(state.deck, cardsFrom(r.displaced)) }
    }
    case 'attach': {
      const r = enemyAttach(state.board, step.at, enemyWord(step.word))
      return { ...state, board: r.board, deck: addToDiscard(state.deck, cardsFrom(r.displaced)) }
    }
    case 'replace': {
      const r = enemyReplace(state.board, step.at, enemyWord(step.word))
      return { ...state, board: r.board, deck: addToDiscard(state.deck, cardsFrom(r.displaced)) }
    }
    case 'seal':
      return { ...state, board: sealSlot(state.board, step.at) }
    case 'pollute': {
      const junk = Array.from({ length: step.count }, (_, i) => ({
        instanceId: `c${state.nextId + i}`,
        wordId: step.word,
      }))
      return { ...state, deck: addToDiscard(state.deck, junk), nextId: state.nextId + step.count }
    }
  }
}

function outcomeOf(entities: readonly Entity[]): 'won' | 'lost' | null {
  const player = entities.find((e) => e.id === PLAYER_ID)
  if (!player || !isAlive(player)) return 'lost'
  return entities.some((e) => e.side === 'enemy' && isAlive(e)) ? null : 'won'
}

function endTurn(state: CombatState, balance: Balance): Reduced<CombatState, CombatEvent> {
  if (state.phase !== 'player') return reject(state, 'notPlayerTurn', null)
  const events: CombatEvent[] = []
  let current: CombatState = { ...state, deck: discardHand(state.deck) }

  // 적 개입 (실행 직전)
  const step = currentIntent(current)
  events.push({ type: 'intervention', step })
  current = applyIntervention(current, step)
  if (step.kind === 'pollute') events.push({ type: 'polluted', wordId: step.word, count: step.count })

  // 문장 실행
  let nextId = current.nextId
  const newId = () => `t${nextId++}`
  let entities: readonly Entity[] = current.entities
  current.board.clauses.forEach((_, clauseIndex) => {
    const r = resolveClause(current.board, clauseIndex, entities, newId)
    entities = r.entities
    events.push(...r.events)
  })
  current = { ...current, entities, nextId }

  // 잉크 건조
  const dried = dryInk(current.board)
  current = {
    ...current,
    board: dried.board,
    deck: addToDiscard(current.deck, cardsFrom(dried.dried.map((d) => d.word))),
  }
  for (const d of dried.dried) {
    events.push({ type: 'dried', at: d.at, wordId: d.word.wordId, modifierIndex: d.modifierIndex })
  }

  // 상태 처리
  current = {
    ...current,
    entities: current.entities.map((entity) => {
      if (!isAlive(entity)) return entity
      const r = tickEndOfTurn(entity)
      if (r.poisonDamage > 0) events.push({ type: 'poisonTick', entityId: entity.id, amount: r.poisonDamage })
      if (!isAlive(r.entity)) events.push({ type: 'died', entityId: entity.id })
      return r.entity
    }),
  }

  // 승패 판정
  const outcome = outcomeOf(current.entities)
  if (outcome) {
    events.push({ type: 'combatEnded', outcome })
    return { state: { ...current, phase: outcome }, events }
  }

  // 다음 예고와 다음 턴
  current = { ...current, loopIndex: current.loopIndex + 1, turn: current.turn + 1 }
  events.push({ type: 'intentRevealed', step: currentIntent(current) })
  const drawn = drawTurn(current, balance)
  return { state: drawn.state, events: [...events, ...drawn.events] }
}

export function reduceCombat(
  state: CombatState,
  action: CombatAction,
  balance: Balance,
): Reduced<CombatState, CombatEvent> {
  switch (action.type) {
    case 'place':
      return place(state, action, balance)
    case 'endTurn':
      return endTurn(state, balance)
  }
}
