import { type BuildState, EMPTY_BUILD, wordLookup } from '@/game/build/build'
import { clearBlock, createEntity, type Entity, isAlive, tickEndOfTurn } from '@/kit/core/entity'
import type { Reduced } from '@/kit/core/reduced'
import { createRng, type RngState, shuffle } from '@/kit/core/rng'
import { addToDiscard, type CardInstance, createDeck, type DeckState, takeFromHand } from '@/kit/deck/deck'
import type { Balance } from '@/game/content/balance'
import { RALLY_ENCOUNTERS, type RallyEncounterDef, type RallyIntent, type SlotAddress } from '@/game/content/enemies'
import { type ConnectiveMode, getWord, type WordId } from '@/game/content/words'
import type { CombatEvent, RejectReason } from '@/game/combat/events'
import type { SlotRole } from '@/game/grammar/frames'
import { type ClauseHooks, resolveClause } from '@/game/resolve/resolve'
import { type Board, getSlot, placeWord, type PlacedWord, playerWordsOnBoard, revertAll } from '@/game/sentence/board'
import { blankClause, blankSentence, enemyBoard, firstAliveEnemy, hasVerb, isBlank, isDefensiveVerb, materialize } from './sentence'

export interface CardInst extends CardInstance {
  readonly wordId: WordId
}

/** 기계 검증용 전투 기록. */
export interface RallyLog {
  readonly casts: number
  readonly defensiveCasts: number
  /** 턴 시작 손패에 동사가 하나도 없던 턴 수. */
  readonly deadTurns: number
  /** 한 번의 내 낭독의 위력(적 HP에 잘리지 않은 피해 합, sentencePower)의 최댓값. */
  readonly bestBurst: number
}

export interface RallyState {
  readonly encounterId: string
  readonly turn: number
  readonly phase: 'player' | 'won' | 'lost'
  readonly entities: readonly Entity[]
  /** 이번 턴에 짓고 있는 내 문장. */
  readonly board: Board
  readonly deck: DeckState<CardInst>
  /** 빈 목적어가 가리킬 적. */
  readonly targetId: string | null
  readonly discardsLeft: number
  /** 이번 전투에서 실행된 절의 수([거듭]용). */
  readonly executions: number
  readonly rng: RngState
  readonly nextId: number
  readonly log: RallyLog
  /** 런에서 쌓인 영구 성장. 기본 랠리는 EMPTY_BUILD. */
  readonly build: BuildState
  /** 층 배율(적 HP·피해). 기본 1·1. */
  readonly enemyScale: EnemyScale
  /** 연결어 칸의 카드. 있으면 내 문장은 두 절이다. */
  readonly connective: PlacedWord | null
  /** 지금까지 받은 봉인 수. 다음 봉인 대상(주어 → 목적어 → 동사)을 정한다. */
  readonly sealCount: number
}

const SEAL_ORDER: readonly SlotRole[] = ['subject', 'object', 'verb']

/** 다음 봉인이 걸릴 내 슬롯(예고에 보여 준다). */
export function nextSealRole(state: RallyState): SlotRole {
  return SEAL_ORDER[state.sealCount % SEAL_ORDER.length]
}

function setSealed(board: Board, role: SlotRole | null): Board {
  return {
    clauses: board.clauses.map((clause, index) =>
      index !== 0 ? clause : { ...clause, slots: clause.slots.map((slot) => ({ ...slot, sealed: slot.role === role })) },
    ),
  }
}

export interface EnemyScale {
  readonly hp: number
  readonly damage: number
}

/** 런이 전투를 시작할 때 넘기는 값. 비어 있으면 기본 랠리와 같다. */
export interface RallyOptions {
  readonly build?: BuildState
  readonly playerHp?: number
  readonly playerMaxHp?: number
  readonly enemyScale?: EnemyScale
}

export type RallyAction =
  | {
      readonly type: 'place'
      readonly instanceId: string
      readonly at: SlotAddress
      readonly modifierIndex?: number
      readonly targetEntityId?: string
    }
  | { readonly type: 'target'; readonly entityId: string }
  | { readonly type: 'discard'; readonly instanceIds: readonly string[] }
  | { readonly type: 'clear' }
  | { readonly type: 'connect'; readonly instanceId: string }
  | { readonly type: 'disconnect' }
  | { readonly type: 'cast' }
  | { readonly type: 'endTurn' }

/** spec §1·§4의 규칙 값. 손패 상한과 버리기 횟수는 빌드 상태(EMPTY_BUILD 기본 8·1)에 있다. */
export const RALLY_RULES = { startHand: 6, drawPerTurn: 5 } as const

/** 적 예고 문장의 수식어 칸 수(내 빌드와 무관). */
const ENEMY_MODIFIER_SLOTS = 2

export const PLAYER_ID = 'p'

type Result = Reduced<RallyState, CombatEvent>

function getEncounter(id: string): RallyEncounterDef {
  const encounter = RALLY_ENCOUNTERS[id]
  if (!encounter) throw new Error(`알 수 없는 조우: ${id}`)
  return encounter
}

/** 이번 턴에 index번째 적이 실행할 예고 문장. */
export function enemyIntent(state: RallyState, enemyIndex: number): RallyIntent {
  const spec = getEncounter(state.encounterId).enemies[enemyIndex]
  if (!spec) throw new Error(`적이 없습니다: ${enemyIndex}`)
  return spec.intents[(state.turn - 1) % spec.intents.length]
}

const has = (state: RallyState, relic: BuildState['relics'][number]) => state.build.relics.includes(relic)

/**
 * 낭독할 내 절에 끼어드는 빌드 훅(유물). 기본값과 같은 필드는 넣지 않는다.
 * 미리보기와 계산식도 이 함수를 쓴다.
 */
export function clauseHooks(state: RallyState, clause: number): ClauseHooks {
  const hooks: { -readonly [K in keyof ClauseHooks]: ClauseHooks[K] } = {}
  let damageBonus = 0
  if (has(state, 'longSentence')) {
    const bonus = playerWordsOnBoard(state.board).length * 2
    damageBonus += bonus
    if (bonus > 0) hooks.supportBonus = bonus
  }
  const subject = state.board.clauses[clause]?.slots.find((s) => s.role === 'subject')
  if (has(state, 'ellipsis') && subject && isBlank(subject.head)) damageBonus += 4
  if (damageBonus > 0) hooks.damageBonus = damageBonus
  if (has(state, 'adjectiveChain')) hooks.chainBoost = true
  if (has(state, 'stress')) hooks.adverbTwice = true
  if (has(state, 'poisonGrammar')) hooks.poisonBonus = 2
  if (has(state, 'echo') && clause === 0 && state.board.clauses.length === 1) hooks.repeatBonus = 1
  return hooks
}

export function connectiveMode(state: RallyState): ConnectiveMode | null {
  const effect = state.connective ? getWord(state.connective.wordId).effect : null
  return effect?.type === 'connective' ? effect.mode : null
}

/** 낭독할 때 빈칸을 채우는 방식(허수아비 화자, 그러면서). */
export function materializeFor(state: RallyState): Board {
  return materialize(state.board, state.targetId, {
    impliedSubject: has(state, 'scarecrowSpeaker') ? 'scarecrow' : undefined,
    borrowModifiers: connectiveMode(state) === 'while',
  })
}

/** 그래서: 앞 절에서 적이 받은 피해 합의 절반(내림). */
export function soBonusFrom(burst: number): number {
  return Math.floor(burst / 2)
}

/** 낭독 직전, 절마다의 실행 조건. 계산식은 이것으로 실제와 같은 값을 낸다. */
export interface ClauseRun {
  readonly hooks: ClauseHooks
  /** 이 절이 실행되기 직전의 개체 상태(앞 절의 결과 반영). */
  readonly entitiesBefore: readonly Entity[]
  readonly executionsBefore: number
  /** 그래서 보너스(절 2에만). */
  readonly soBonus: number
}

/**
 * 내 문장의 절들을 순서대로 실행한다. 그래서이면 절 1의 피해 절반을 절 2의 피해 기본값에 더한다.
 * 실제 낭독과 계산식이 같은 함수를 쓴다.
 */
export function runSentence(state: RallyState): { state: RallyState; events: CombatEvent[]; burst: number; clauses: ClauseRun[] } {
  const board = materializeFor(state)
  const mode = connectiveMode(state)
  let current = state
  let burst = 0
  let previousBurst = 0
  const events: CombatEvent[] = []
  const clauses: ClauseRun[] = []
  board.clauses.forEach((_, clause) => {
    const base = clauseHooks(state, clause)
    const soBonus = clause > 0 && mode === 'so' ? soBonusFrom(previousBurst) : 0
    const hooks = soBonus > 0 ? { ...base, damageBonus: (base.damageBonus ?? 0) + soBonus } : base
    clauses.push({ hooks, entitiesBefore: current.entities, executionsBefore: current.executions, soBonus })
    const executed = runClause(current, board, clause, hooks, 'player')
    current = executed.state
    events.push(...executed.events)
    previousBurst = enemyDamageTaken(executed.events, current.entities)
    burst += previousBurst
  })
  return { state: current, events, burst, clauses }
}

/**
 * 문장의 위력: 적의 남은 HP에 잘리지 않은 즉시 피해. 적이 쓰러져도 남은 반복과 절을 끝까지 친다고 보고 잰다.
 * 최대 한 방 기록용이며 실제 상태에는 반영하지 않는다.
 */
export function sentencePower(state: RallyState): number {
  const unbounded = state.entities.map((e) => (e.side === 'enemy' ? { ...e, hp: Number.MAX_SAFE_INTEGER, maxHp: Number.MAX_SAFE_INTEGER } : e))
  return runSentence({ ...state, entities: unbounded }).burst
}

function cardsFrom(words: readonly PlacedWord[]): CardInst[] {
  return words.flatMap((w) => (w.owner === 'player' && w.instanceId ? [{ instanceId: w.instanceId, wordId: w.wordId }] : []))
}

function handHasVerb(hand: readonly CardInst[]): boolean {
  return hand.some((c) => getWord(c.wordId).effect.type === 'verb')
}

/** 손패 상한을 지키며 한 장씩 뽑는다. 뽑을 더미가 비면 버림 더미를 섞고, 넘치는 카드는 소각한다. */
function drawCards(state: RallyState, count: number): Result {
  let { drawPile, hand, discardPile } = state.deck
  let rng = state.rng
  let reshuffled = false
  let drawn = 0
  const burned: CombatEvent[] = []
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
    if (hand.length >= state.build.handMax) {
      discardPile = [...discardPile, card]
      burned.push({ type: 'burned', wordId: card.wordId })
    } else {
      hand = [...hand, card]
      drawn++
    }
  }
  return {
    state: { ...state, deck: { drawPile, hand, discardPile }, rng },
    events: [{ type: 'drawn', count: drawn, reshuffled }, ...burned],
  }
}

/** 내 턴 시작: 보호 소멸, 버리기 회복, 드로우, 대상 보정. */
function startPlayerTurn(state: RallyState, drawCount: number): Result {
  const entities = state.entities.map((e) => (e.id === PLAYER_ID ? clearBlock(e) : e))
  const refreshed: RallyState = { ...state, entities, discardsLeft: state.build.discardsPerTurn }
  const drawn = drawCards(refreshed, drawCount)
  const target = drawn.state.entities.find((e) => e.id === drawn.state.targetId)
  const targetId = target && isAlive(target) ? drawn.state.targetId : firstAliveEnemy(drawn.state.entities)
  const dead = handHasVerb(drawn.state.deck.hand) ? 0 : 1
  return {
    state: { ...drawn.state, targetId, log: { ...drawn.state.log, deadTurns: drawn.state.log.deadTurns + dead } },
    events: drawn.events,
  }
}

export function startRally(
  encounterId: string,
  deckWordIds: readonly WordId[],
  seed: number,
  balance: Balance,
  options: RallyOptions = {},
): Result {
  const encounter = getEncounter(encounterId)
  const build = options.build ?? EMPTY_BUILD
  const enemyScale = options.enemyScale ?? { hp: 1, damage: 1 }
  const maxHp = options.playerMaxHp ?? balance.playerMaxHp
  const player = { ...createEntity({ id: PLAYER_ID, defId: 'player', name: '탐험가', side: 'ally', hp: maxHp }), hp: options.playerHp ?? maxHp }
  const enemies = encounter.enemies.map((spec, index) =>
    createEntity({
      id: `e${index}`, defId: spec.defId, name: spec.name, side: 'enemy', hp: Math.round(spec.hp * enemyScale.hp), row: spec.row,
    }),
  )
  const cards = deckWordIds.map((wordId, index) => ({ instanceId: `c${index}`, wordId }))
  const { deck, rng } = createDeck(cards, createRng(seed))
  const initial: RallyState = {
    encounterId,
    turn: 1,
    phase: 'player',
    entities: [player, ...enemies],
    board: blankSentence(build.slots),
    deck,
    targetId: firstAliveEnemy(enemies),
    discardsLeft: build.discardsPerTurn,
    executions: 0,
    rng,
    nextId: cards.length,
    log: { casts: 0, defensiveCasts: 0, deadTurns: 0, bestBurst: 0 },
    build,
    enemyScale,
    connective: null,
    sealCount: 0,
  }
  return startPlayerTurn(initial, RALLY_RULES.startHand)
}

function reject(state: RallyState, reason: RejectReason, at: SlotAddress | null = null): Result {
  return { state, events: [{ type: 'rejected', reason, at }] }
}

function outcomeOf(entities: readonly Entity[]): 'won' | 'lost' | null {
  const player = entities.find((e) => e.id === PLAYER_ID)
  if (!player || !isAlive(player)) return 'lost'
  return entities.some((e) => e.side === 'enemy' && isAlive(e)) ? null : 'won'
}

function isAliveEnemy(state: RallyState, id: string): boolean {
  const entity = state.entities.find((e) => e.id === id)
  return entity !== undefined && entity.side === 'enemy' && isAlive(entity)
}

function place(state: RallyState, action: Extract<RallyAction, { type: 'place' }>): Result {
  const { at } = action
  const card = state.deck.hand.find((c) => c.instanceId === action.instanceId)
  if (!card) return reject(state, 'unplayable', at)
  const def = getWord(card.wordId)
  if (def.cost === null || def.enemyOnly) return reject(state, 'unplayable', at)
  if (!state.board.clauses[at.clause]) return reject(state, 'slotInactive', at)
  if (getSlot(state.board, at).sealed) return reject(state, 'slotSealed', at)

  let targetEntityId: string | null = null
  if (def.effect.type === 'target' && def.effect.ref.kind === 'chosenEnemy') {
    const requested = action.targetEntityId ?? state.targetId
    if (!requested || !isAliveEnemy(state, requested)) return reject(state, 'noTarget', at)
    targetEntityId = requested
  }

  const placed: PlacedWord = { wordId: card.wordId, owner: 'player', inkLeft: null, instanceId: card.instanceId, targetEntityId }
  const result = placeWord(state.board, at, placed, action.modifierIndex)
  if (!result.ok) return reject(state, result.reason, at)
  const taken = takeFromHand(state.deck, card.instanceId)
  if (!taken) return reject(state, 'unplayable', at)
  // 밀려난 내 카드는 손패로 돌아간다(문장을 고쳐 짓는 중이므로).
  const deck = { ...taken.deck, hand: [...taken.deck.hand, ...cardsFrom(result.displaced)] }
  const modifierIndex = def.kind === 'adjective' || def.kind === 'adverb'
    ? getSlot(result.board, at).modifiers.findIndex((m) => m?.instanceId === card.instanceId)
    : null
  return {
    state: { ...state, board: result.board, deck },
    events: [{ type: 'placed', at, wordId: card.wordId, modifierIndex }],
  }
}

function discard(state: RallyState, instanceIds: readonly string[]): Result {
  if (instanceIds.length === 0) return reject(state, 'unplayable')
  const handIds = new Set(state.deck.hand.map((c) => c.instanceId))
  if (instanceIds.some((id) => !handIds.has(id)) || new Set(instanceIds).size !== instanceIds.length) {
    return reject(state, 'unplayable')
  }
  if (state.discardsLeft <= 0) return reject(state, 'noDiscardLeft')
  const chosen = new Set(instanceIds)
  const thrown = state.deck.hand.filter((c) => chosen.has(c.instanceId))
  const kept = state.deck.hand.filter((c) => !chosen.has(c.instanceId))
  const discarded: RallyState = {
    ...state,
    deck: { ...state.deck, hand: kept, discardPile: [...state.deck.discardPile, ...thrown] },
    discardsLeft: state.discardsLeft - 1,
  }
  const drawn = drawCards(discarded, thrown.length)
  return { state: drawn.state, events: [{ type: 'discarded', count: thrown.length }, ...drawn.events] }
}

/** 문장을 한 절의 빈칸으로 되돌리고, 놓았던 내 카드(연결어 포함)를 돌려준다. */
function clearSentence(state: RallyState): { board: Board; cards: CardInst[] } {
  const r = revertAll(state.board)
  const connective = state.connective ? cardsFrom([state.connective]) : []
  return { board: { clauses: r.board.clauses.slice(0, 1) }, cards: [...cardsFrom(r.displaced), ...connective] }
}

/** 문장을 빈칸으로 되돌리고, 놓았던 내 카드를 손패로 돌려보낸다. */
function returnPlacedToHand(state: RallyState): RallyState {
  const { board, cards } = clearSentence(state)
  return { ...state, board, connective: null, deck: { ...state.deck, hand: [...state.deck.hand, ...cards] } }
}

function connect(state: RallyState, instanceId: string): Result {
  const card = state.deck.hand.find((c) => c.instanceId === instanceId)
  if (!card) return reject(state, 'unplayable')
  if (getWord(card.wordId).kind !== 'connective') return reject(state, 'kindMismatch')
  const taken = takeFromHand(state.deck, instanceId)
  if (!taken) return reject(state, 'unplayable')
  const previous = state.connective ? cardsFrom([state.connective]) : []
  const board = state.board.clauses.length > 1 ? state.board : { clauses: [...state.board.clauses, blankClause(state.build.slots)] }
  const connective: PlacedWord = { wordId: card.wordId, owner: 'player', inkLeft: null, instanceId, targetEntityId: null }
  return {
    state: { ...state, board, connective, deck: { ...taken.deck, hand: [...taken.deck.hand, ...previous] } },
    events: [{ type: 'connected', wordId: card.wordId }],
  }
}

/** 연결어를 빼면 둘째 절이 닫히고, 둘째 절의 카드와 연결어는 손패로 돌아온다. */
function disconnect(state: RallyState): Result {
  if (!state.connective) return reject(state, 'unplayable')
  const second = { clauses: state.board.clauses.slice(1) }
  const cards = [...cardsFrom(playerWordsOnBoard(second)), ...cardsFrom([state.connective])]
  return {
    state: { ...state, board: { clauses: state.board.clauses.slice(0, 1) }, connective: null, deck: { ...state.deck, hand: [...state.deck.hand, ...cards] } },
    events: [{ type: 'disconnected' }],
  }
}

function enemyDamageTaken(events: readonly CombatEvent[], entities: readonly Entity[]): number {
  const enemyIds = new Set(entities.filter((e) => e.side === 'enemy').map((e) => e.id))
  return events.reduce(
    (sum, e) => ((e.type === 'damaged' || e.type === 'hpLost') && enemyIds.has(e.entityId) ? sum + e.amount : sum),
    0,
  )
}

/** 절 하나를 실행한다. 내 절은 강화(lookup)와 빌드 훅, 적 절은 층 배율 훅을 받는다. */
function runClause(
  state: RallyState,
  board: Board,
  clause: number,
  hooks: ClauseHooks,
  side: 'player' | 'enemy',
): { state: RallyState; events: CombatEvent[] } {
  let nextId = state.nextId
  const lookup = side === 'player' ? wordLookup(state.build) : undefined
  const r = resolveClause(board, clause, state.entities, () => `t${nextId++}`, { executions: state.executions, lookup, hooks })
  return { state: { ...state, entities: r.entities, nextId, executions: state.executions + 1 }, events: r.events }
}

/** 적 턴: 보호 소멸 → 적마다 예고 문장 실행 → 상태 처리 → 다음 내 턴. */
function enemyPhase(state: RallyState, events: CombatEvent[]): Result {
  events.push({ type: 'enemyTurn' })
  // 적 턴 시작: 적의 보호와 지난 봉인이 사라진다.
  let current: RallyState = {
    ...state,
    board: setSealed(state.board, null),
    entities: state.entities.map((e) => (e.side === 'enemy' && isAlive(e) ? clearBlock(e) : e)),
  }
  const ended = (outcome: 'won' | 'lost'): Result => {
    events.push({ type: 'combatEnded', outcome })
    return { state: { ...current, phase: outcome }, events }
  }

  for (const [index, spec] of getEncounter(current.encounterId).enemies.entries()) {
    const enemyId = `e${index}`
    if (!isAliveEnemy(current, enemyId) || !spec) continue
    const intent = enemyIntent(current, index)
    if (intent.kind === 'seal') {
      const role = nextSealRole(current)
      current = { ...current, board: setSealed(current.board, role), sealCount: current.sealCount + 1 }
      events.push({ type: 'sealed', role })
      continue
    }
    const board = enemyBoard(intent.clause, enemyId, ENEMY_MODIFIER_SLOTS)
    const executed = runClause(current, board, 0, { damageScale: current.enemyScale.damage }, 'enemy')
    current = executed.state
    events.push(...executed.events)
    const outcome = outcomeOf(current.entities)
    if (outcome) return ended(outcome)
  }

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
  if (outcome) return ended(outcome)

  const started = startPlayerTurn({ ...current, turn: current.turn + 1 }, RALLY_RULES.drawPerTurn)
  return { state: started.state, events: [...events, ...started.events] }
}

function cast(state: RallyState): Result {
  if (!hasVerb(state.board)) return reject(state, 'noVerb')
  const events: CombatEvent[] = [{ type: 'cast', by: 'player' }]
  const verbId = getSlot(state.board, { clause: 0, role: 'verb' }).head.wordId
  const executed = runSentence(state)
  events.push(...executed.events)
  const power = sentencePower(state)
  const cleared = clearSentence(executed.state)
  // 울림: 첫 절의 동사 카드는 버림 더미 대신 손패로 돌아온다.
  const verbCard = has(state, 'resonance') ? getSlot(state.board, { clause: 0, role: 'verb' }).head.instanceId : null
  const used = cleared.cards
  const returned = used.filter((c) => c.instanceId === verbCard)
  const spent = used.filter((c) => c.instanceId !== verbCard)
  const afterCast = addToDiscard(executed.state.deck, spent)
  let current: RallyState = {
    ...executed.state,
    board: cleared.board,
    connective: null,
    deck: { ...afterCast, hand: [...afterCast.hand, ...returned] },
    log: {
      ...executed.state.log,
      casts: executed.state.log.casts + 1,
      defensiveCasts: executed.state.log.defensiveCasts + (isDefensiveVerb(verbId) ? 1 : 0),
      bestBurst: Math.max(executed.state.log.bestBurst, power),
    },
  }
  const outcome = outcomeOf(current.entities)
  if (outcome) {
    events.push({ type: 'combatEnded', outcome })
    current = { ...current, phase: outcome }
    return { state: current, events }
  }
  return enemyPhase(current, events)
}

export function reduceRally(state: RallyState, action: RallyAction, _balance: Balance): Result {
  if (state.phase !== 'player') return reject(state, 'notPlayerTurn')
  switch (action.type) {
    case 'place':
      return place(state, action)
    case 'target':
      if (!isAliveEnemy(state, action.entityId)) return reject(state, 'noTarget')
      return { state: { ...state, targetId: action.entityId }, events: [{ type: 'targetChanged', entityId: action.entityId }] }
    case 'discard':
      return discard(state, action.instanceIds)
    case 'clear':
      return { state: returnPlacedToHand(state), events: [{ type: 'cleared' }] }
    case 'connect':
      return connect(state, action.instanceId)
    case 'disconnect':
      return disconnect(state)
    case 'cast':
      return cast(state)
    case 'endTurn':
      return enemyPhase(returnPlacedToHand(state), [])
  }
}
