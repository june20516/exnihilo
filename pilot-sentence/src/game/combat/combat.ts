import { createEntity, type Entity, isAlive, tickEndOfTurn } from '@/kit/core/entity'
import type { Reduced } from '@/kit/core/reduced'
import { createRng, type RngState, shuffle } from '@/kit/core/rng'
import { addToDiscard, type CardInstance, createDeck, type DeckState, discardHand, takeFromHand } from '@/kit/deck/deck'
import type { Balance } from '@/game/content/balance'
import { ENCOUNTERS, type EncounterDef, type InterventionStep, type SlotAddress } from '@/game/content/encounters'
import type { RuleConfig } from '@/game/content/rules'
import { getWord, type WordId } from '@/game/content/words'
import { resolveClause } from '@/game/resolve/resolve'
import {
  type Board, buildBoard, dryInk, enemyAttach, enemyReplace, getSlot, isSlotActive, placeWord, type PlacedWord, revertAll,
  revertSlot, sealSlot, swapNounPhrases,
} from '@/game/sentence/board'
import type { CombatEvent, RejectReason } from './events'

export interface CardInst extends CardInstance {
  readonly wordId: WordId
}

export interface CombatState {
  readonly encounterId: string
  readonly rules: RuleConfig
  readonly turn: number
  readonly phase: 'player' | 'won' | 'lost'
  readonly entities: readonly Entity[]
  readonly board: Board
  readonly deck: DeckState<CardInst>
  /** 행동력·마나·잉크(프리셋에 따라 의미가 다르다). */
  readonly resource: number
  readonly loopIndex: number
  readonly enraged: boolean
  readonly swapsLeft: number
  /** 이번 전투에서 실행된 절의 수([거듭]용). */
  readonly executions: number
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
  | { readonly type: 'swap'; readonly clause: number }
  | { readonly type: 'drawPaid' }
  | { readonly type: 'cast' }
  | { readonly type: 'endTurn' }

export const PLAYER_ID = 'p'
const ENRAGED_STEPS_PER_TURN = 2

function getEncounter(id: string): EncounterDef {
  const encounter = ENCOUNTERS[id]
  if (!encounter) throw new Error(`알 수 없는 조우: ${id}`)
  return encounter
}

/** 다음 턴 종료 때 실행될 개입 단계들(평소 1개, 격앙 시 2개). */
export function upcomingIntents(state: CombatState): InterventionStep[] {
  const loop = getEncounter(state.encounterId).interventionLoop
  const count = state.enraged ? ENRAGED_STEPS_PER_TURN : 1
  return Array.from({ length: count }, (_, i) => loop[(state.loopIndex + i) % loop.length])
}

export function currentIntent(state: CombatState): InterventionStep {
  return upcomingIntents(state)[0]
}

/** 낭독 모드에서 적이 낭독하기까지 남은 턴 수(이번 턴 종료 때 낭독하면 1). 자동 모드는 null. */
export function turnsUntilEnemyCast(state: CombatState): number | null {
  if (state.rules.execution !== 'cast') return null
  const every = getEncounter(state.encounterId).castEvery
  return every - ((state.turn - 1) % every)
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

/** 손패 상한을 지키며 한 장씩 뽑는다. 넘치는 카드는 버림 더미로 간다(소각). */
function drawCards(state: CombatState, count: number): Reduced<CombatState, CombatEvent> {
  let { drawPile, hand, discardPile } = state.deck
  let rng = state.rng
  let reshuffled = false
  let drawn = 0
  const events: CombatEvent[] = []
  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break
      const [shuffled, nextRng] = shuffle(rng, discardPile)
      drawPile = shuffled
      discardPile = []
      rng = nextRng
      reshuffled = true
    }
    const [card, ...rest] = drawPile
    drawPile = rest
    if (hand.length >= state.rules.handMax) {
      discardPile = [...discardPile, card]
      events.push({ type: 'burned', wordId: card.wordId })
    } else {
      hand = [...hand, card]
      drawn++
    }
  }
  return {
    state: { ...state, deck: { drawPile, hand, discardPile }, rng },
    events: [{ type: 'drawn', count: drawn, reshuffled }, ...events],
  }
}

function resourceAtTurnStart(state: CombatState): number {
  const rule = state.rules.resource
  switch (rule.mode) {
    case 'fixed':
      return rule.perTurn
    case 'ramp':
      return Math.min(rule.max, rule.start + state.turn - 1)
    case 'ink':
      return state.turn === 1 ? rule.start : Math.min(rule.max, state.resource + rule.regen)
  }
}

function startTurn(state: CombatState, drawCount: number): Reduced<CombatState, CombatEvent> {
  const resource = resourceAtTurnStart(state)
  const refreshed: CombatState = { ...state, resource, swapsLeft: state.rules.swapsPerTurn }
  const drawn = drawCards(refreshed, drawCount)
  return {
    state: drawn.state,
    events: [{ type: 'resourceGained', amount: resource - state.resource, total: resource }, ...drawn.events],
  }
}

export function startCombat(
  encounterId: string,
  deckWordIds: readonly WordId[],
  seed: number,
  balance: Balance,
  rules: RuleConfig,
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
    rules,
    turn: 1,
    phase: 'player',
    entities: [player, ...enemies],
    board: buildBoard(encounter.initialSentence, balance.maxModifiers),
    deck,
    resource: 0,
    loopIndex: 0,
    enraged: false,
    swapsLeft: rules.swapsPerTurn,
    executions: 0,
    rng,
    nextId: cards.length,
  }
  const started = startTurn(initial, rules.startHand)
  return {
    state: started.state,
    events: [...started.events, ...upcomingIntents(started.state).map((step) => ({ type: 'intentRevealed' as const, step }))],
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

/** 놓은 단어가 유지되는 실행 횟수. 영구·낭독 소비 프리셋에서는 마르지 않는다(null). */
function inkFor(state: CombatState, wordId: WordId): number | null {
  if (state.rules.persistence !== 'dry') return null
  const def = getWord(wordId)
  const bonus = def.effect.type === 'adverb'
    ? def.effect.mods.reduce((sum, m) => (m.kind === 'inkBonus' ? sum + m.amount : sum), 0)
    : 0
  return def.ink + bonus
}

function place(
  state: CombatState,
  action: Extract<CombatAction, { type: 'place' }>,
  balance: Balance,
): Reduced<CombatState, CombatEvent> {
  const { at } = action
  const card = state.deck.hand.find((c) => c.instanceId === action.instanceId)
  if (!card) return reject(state, 'unplayable', at)
  const def = getWord(card.wordId)
  if (def.cost === null) return reject(state, 'unplayable', at)
  const slot = state.board.clauses[at.clause]?.slots.find((s) => s.role === at.role)
  if (!slot) return reject(state, 'kindMismatch', at)
  const cost = def.cost + (slot.sealed ? balance.sealExtraCost : 0)
  if (cost > state.resource) return reject(state, 'notEnoughAp', at)

  let targetEntityId: string | null = null
  if (def.effect.type === 'target' && def.effect.ref.kind === 'chosenEnemy') {
    targetEntityId = chooseTarget(state, action.targetEntityId)
    if (!targetEntityId) return reject(state, 'noTarget', at)
  }

  const placed: PlacedWord = {
    wordId: card.wordId, owner: 'player', inkLeft: inkFor(state, card.wordId), instanceId: card.instanceId, targetEntityId,
  }
  const result = placeWord(state.board, at, placed, action.modifierIndex)
  if (!result.ok) return reject(state, result.reason, at)
  const taken = takeFromHand(state.deck, card.instanceId)
  if (!taken) return reject(state, 'unplayable', at)

  const modifierIndex = def.kind === 'adjective' || def.kind === 'adverb'
    ? getSlot(result.board, at).modifiers.findIndex((m) => m?.instanceId === card.instanceId)
    : null
  return {
    state: { ...state, board: result.board, deck: addToDiscard(taken.deck, cardsFrom(result.displaced)), resource: state.resource - cost },
    events: [{ type: 'placed', at, wordId: card.wordId, modifierIndex }, { type: 'apSpent', amount: cost }],
  }
}

function swap(state: CombatState, clause: number): Reduced<CombatState, CombatEvent> {
  if (state.swapsLeft <= 0) return reject(state, 'noSwapLeft', null)
  if (!state.board.clauses[clause]) return reject(state, 'kindMismatch', null)
  if (!isSlotActive(state.board, { clause, role: 'object' })) return reject(state, 'slotInactive', { clause, role: 'object' })
  const sealed = ['subject', 'object'].some((role) => state.board.clauses[clause].slots.find((s) => s.role === role)?.sealed)
  if (sealed) return reject(state, 'slotSealed', null)
  if (state.resource < state.rules.swapCost) return reject(state, 'notEnoughAp', null)
  return {
    state: {
      ...state,
      board: swapNounPhrases(state.board, clause),
      swapsLeft: state.swapsLeft - 1,
      resource: state.resource - state.rules.swapCost,
    },
    events: [{ type: 'swapped', clause }, { type: 'apSpent', amount: state.rules.swapCost }],
  }
}

function drawPaid(state: CombatState): Reduced<CombatState, CombatEvent> {
  const cost = state.rules.paidDrawCost
  if (cost === null) return reject(state, 'noPaidDraw', null)
  if (state.resource < cost) return reject(state, 'notEnoughAp', null)
  if (state.deck.drawPile.length === 0 && state.deck.discardPile.length === 0) return reject(state, 'deckEmpty', null)
  const drawn = drawCards({ ...state, resource: state.resource - cost }, 1)
  return { state: drawn.state, events: [{ type: 'apSpent', amount: cost }, ...drawn.events] }
}

export function applyIntervention(state: CombatState, step: InterventionStep): CombatState {
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
    case 'enrage':
      return { ...state, enraged: true }
    case 'pollute': {
      const junk = Array.from({ length: step.count }, (_, i) => ({ instanceId: `c${state.nextId + i}`, wordId: step.word }))
      return { ...state, deck: addToDiscard(state.deck, junk), nextId: state.nextId + step.count }
    }
  }
}

/** 문장의 모든 절을 실행한다. */
export function executeSentence(state: CombatState): Reduced<CombatState, CombatEvent> {
  let nextId = state.nextId
  const newId = () => `t${nextId++}`
  let entities: readonly Entity[] = state.entities
  let executions = state.executions
  const events: CombatEvent[] = []
  state.board.clauses.forEach((_, clauseIndex) => {
    const r = resolveClause(state.board, clauseIndex, entities, newId, { executions })
    entities = r.entities
    executions++
    events.push(...r.events)
  })
  return { state: { ...state, entities, nextId, executions }, events }
}

/** 낭독 후 소비: 플레이어 단어는 버림 더미로, 문장은 원문으로. */
function consumeAfterCast(state: CombatState): CombatState {
  const r = revertAll(state.board)
  return { ...state, board: r.board, deck: addToDiscard(state.deck, cardsFrom(r.displaced)) }
}

function applyInterventions(state: CombatState, events: CombatEvent[]): { state: CombatState; stepCount: number } {
  const steps = upcomingIntents(state)
  let current = state
  for (const step of steps) {
    events.push({ type: 'intervention', step })
    current = applyIntervention(current, step)
    if (step.kind === 'pollute') events.push({ type: 'polluted', wordId: step.word, count: step.count })
  }
  return { state: current, stepCount: steps.length }
}

function outcomeOf(entities: readonly Entity[]): 'won' | 'lost' | null {
  const player = entities.find((e) => e.id === PLAYER_ID)
  if (!player || !isAlive(player)) return 'lost'
  return entities.some((e) => e.side === 'enemy' && isAlive(e)) ? null : 'won'
}

/** 턴 종료 흐름. 낭독(cast)이면 먼저 문장을 실행하고 소비한다. */
function endTurn(state: CombatState, playerCast: boolean): Reduced<CombatState, CombatEvent> {
  const events: CombatEvent[] = []
  let current = state

  if (playerCast) {
    events.push({ type: 'cast', by: 'player' })
    const executed = executeSentence(current)
    events.push(...executed.events)
    current = consumeAfterCast(executed.state)
    const early = outcomeOf(current.entities)
    if (early) {
      events.push({ type: 'combatEnded', outcome: early })
      return { state: { ...current, phase: early }, events }
    }
  }

  if (current.rules.handCarry === 'discard') current = { ...current, deck: discardHand(current.deck) }

  // 적 개입 (실행 직전)
  const intervened = applyInterventions(current, events)
  current = intervened.state

  // 문장 실행: 자동 모드는 매 턴, 낭독 모드는 적의 낭독 주기에만
  const enemyCasts = current.rules.execution === 'cast' && turnsUntilEnemyCast(current) === 1
  if (current.rules.execution === 'auto' || enemyCasts) {
    if (enemyCasts) events.push({ type: 'cast', by: 'enemy' })
    const executed = executeSentence(current)
    events.push(...executed.events)
    current = executed.state
    if (enemyCasts) current = consumeAfterCast(current)
  }

  // 놓은 단어의 지속
  if (current.rules.persistence === 'dry') {
    const dried = dryInk(current.board)
    current = { ...current, board: dried.board, deck: addToDiscard(current.deck, cardsFrom(dried.dried.map((d) => d.word))) }
    for (const d of dried.dried) events.push({ type: 'dried', at: d.at, wordId: d.word.wordId, modifierIndex: d.modifierIndex })
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

  const outcome = outcomeOf(current.entities)
  if (outcome) {
    events.push({ type: 'combatEnded', outcome })
    return { state: { ...current, phase: outcome }, events }
  }

  current = { ...current, loopIndex: current.loopIndex + intervened.stepCount, turn: current.turn + 1 }
  for (const step of upcomingIntents(current)) events.push({ type: 'intentRevealed', step })
  const started = startTurn(current, current.rules.autoDraw)
  return { state: started.state, events: [...events, ...started.events] }
}

export function reduceCombat(
  state: CombatState,
  action: CombatAction,
  balance: Balance,
): Reduced<CombatState, CombatEvent> {
  if (state.phase !== 'player') return reject(state, 'notPlayerTurn', null)
  switch (action.type) {
    case 'place':
      return place(state, action, balance)
    case 'swap':
      return swap(state, action.clause)
    case 'drawPaid':
      return drawPaid(state)
    case 'cast':
      return state.rules.execution === 'cast' ? endTurn(state, true) : reject(state, 'cannotCast', null)
    case 'endTurn':
      return endTurn(state, false)
  }
}
