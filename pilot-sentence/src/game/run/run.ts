import { createRng, nextInt, type RngState } from '@/kit/core/rng'
import type { Reduced } from '@/kit/core/reduced'
import { applyStructure, type BuildState, EMPTY_BUILD, withUpgrade } from '@/game/build/build'
import { RALLY_RULES, RUN_RULES } from '@/game/content/balance'
import { type EncounterTier, RALLY_STARTER_DECK } from '@/game/content/enemies'
import type { WordId } from '@/game/content/words'
import type { CombatEvent, RejectReason } from '@/game/combat/events'
import { type RallyAction, type RallyState, reduceRally, startRally } from '@/game/rally/combat'
import { PLAYER_ID } from '@/game/content/characters'
import { FIXED_ENCOUNTERS, FLOORS, goldFor, NORMAL_ENCOUNTERS } from './floors'
import { buyFrom, type Offer, rollShop, type ShopState } from './shop'

export interface FloorRecord {
  readonly floor: number
  readonly tier: EncounterTier
  readonly turns: number
}

export interface RunLog {
  /** 런 전체에서 한 번의 낭독의 위력(적 HP에 잘리지 않은 피해)의 최댓값. */
  readonly bestBurst: number
  readonly purchases: readonly Offer[]
  readonly floorTurns: readonly FloorRecord[]
}

export interface RunState {
  readonly seed: number
  /** 1..7 */
  readonly floor: number
  readonly phase: 'combat' | 'shop' | 'won' | 'lost'
  readonly hp: number
  readonly maxHp: number
  readonly gold: number
  readonly deck: readonly WordId[]
  readonly build: BuildState
  readonly combat: RallyState | null
  readonly shop: ShopState | null
  readonly rng: RngState
  readonly log: RunLog
}

export type RunAction =
  | { readonly type: 'combat'; readonly action: RallyAction }
  | { readonly type: 'buy'; readonly index: number }
  | { readonly type: 'leave' }

export type RunEvent =
  | CombatEvent
  | { readonly type: 'floorCleared'; readonly floor: number; readonly gold: number }
  | { readonly type: 'bought'; readonly offer: Offer; readonly price: number }
  | { readonly type: 'runEnded'; readonly outcome: 'won' | 'lost' }

/** 런 전용 이벤트 종류. 런 이벤트를 새로 만들면 여기 빠뜨린 것을 컴파일러가 잡는다. */
const RUN_ONLY_EVENTS: Record<Exclude<RunEvent['type'], CombatEvent['type']>, true> = { floorCleared: true, bought: true, runEnded: true }

/** 런 이벤트 중 전투 이벤트(연출 큐에 넣을 것). */
export function isCombatEvent(event: RunEvent): event is CombatEvent {
  return !(event.type in RUN_ONLY_EVENTS)
}

type Result = Reduced<RunState, RunEvent>

const SEED_MAX = 1_000_000_000

function reject(state: RunState, reason: RejectReason): Result {
  return { state, events: [{ type: 'rejected', reason, at: null }] }
}

function floorDef(floor: number) {
  const def = FLOORS[floor - 1]
  if (!def) throw new Error(`없는 층: ${floor}`)
  return def
}

/** 이번 층의 전투를 시작한다. 일반 층의 조우와 전투 시드는 런 rng에서 뽑는다. */
function startFloor(state: RunState): Result {
  const def = floorDef(state.floor)
  let rng = state.rng
  let encounterId = FIXED_ENCOUNTERS[state.floor]
  if (!encounterId) {
    const [index, next] = nextInt(rng, 0, NORMAL_ENCOUNTERS.length - 1)
    encounterId = NORMAL_ENCOUNTERS[index]
    rng = next
  }
  const [combatSeed, afterSeed] = nextInt(rng, 1, SEED_MAX)
  const started = startRally(encounterId, state.deck, combatSeed, {
    build: state.build,
    playerHp: state.hp,
    playerMaxHp: state.maxHp,
    enemyScale: def.scale,
  })
  return {
    state: { ...state, phase: 'combat', combat: started.state, shop: null, rng: afterSeed },
    events: started.events,
  }
}

export function startRun(seed: number, deck: readonly WordId[] = RALLY_STARTER_DECK): Result {
  const initial: RunState = {
    seed,
    floor: 1,
    phase: 'combat',
    hp: RALLY_RULES.playerMaxHp,
    maxHp: RALLY_RULES.playerMaxHp,
    gold: 0,
    deck,
    build: EMPTY_BUILD,
    combat: null,
    shop: null,
    rng: createRng(seed),
    log: { bestBurst: 0, purchases: [], floorTurns: [] },
  }
  return startFloor(initial)
}

/** 전투 진행을 반영한다. 끝났으면 승리는 회복·화폐·상점(마지막 층이면 완주), 패배는 런 종료. */
function settleCombat(state: RunState, combat: RallyState, events: RunEvent[]): Result {
  const bestBurst = Math.max(state.log.bestBurst, combat.log.bestBurst)
  if (combat.phase === 'player') return { state: { ...state, combat, log: { ...state.log, bestBurst } }, events }

  const log: RunLog = {
    ...state.log,
    bestBurst,
    floorTurns: [...state.log.floorTurns, { floor: state.floor, tier: floorDef(state.floor).tier, turns: combat.turn }],
  }
  if (combat.phase === 'lost') {
    events.push({ type: 'runEnded', outcome: 'lost' })
    return { state: { ...state, combat, log, phase: 'lost', hp: 0 }, events }
  }

  const player = combat.entities.find((e) => e.id === PLAYER_ID)
  const hp = Math.min(state.maxHp, (player?.hp ?? 0) + Math.floor(state.maxHp * RUN_RULES.healRatio))
  const gold = goldFor(floorDef(state.floor).tier, [])
  events.push({ type: 'floorCleared', floor: state.floor, gold })
  const cleared: RunState = { ...state, combat, log, hp, gold: state.gold + gold }
  if (state.floor >= FLOORS.length) {
    events.push({ type: 'runEnded', outcome: 'won' })
    return { state: { ...cleared, phase: 'won', shop: null }, events }
  }
  const [shop, rng] = rollShop(state.rng, state.deck, state.build)
  return { state: { ...cleared, phase: 'shop', shop, rng }, events }
}

function applyOffer(state: RunState, offer: Offer): RunState {
  switch (offer.kind) {
    case 'word':
      return { ...state, deck: [...state.deck, offer.wordId] }
    case 'upgrade':
      return { ...state, build: withUpgrade(state.build, offer.wordId) }
    case 'structure':
      return { ...state, build: applyStructure(state.build, offer.id) }
    case 'relic':
      return { ...state, build: { ...state.build, relics: [...state.build.relics, offer.id] } }
  }
}

function buy(state: RunState, index: number): Result {
  const item = state.shop?.items[index]
  if (!state.shop || !item || item.sold) return reject(state, 'soldOut')
  if (item.price > state.gold) return reject(state, 'notEnoughGold')
  const bought = applyOffer(state, item.offer)
  return {
    state: {
      ...bought,
      gold: state.gold - item.price,
      shop: buyFrom(state.shop, index),
      log: { ...state.log, purchases: [...state.log.purchases, item.offer] },
    },
    events: [{ type: 'bought', offer: item.offer, price: item.price }],
  }
}

export function reduceRun(state: RunState, action: RunAction): Result {
  switch (action.type) {
    case 'combat': {
      if (state.phase !== 'combat' || !state.combat) return reject(state, 'notPlayerTurn')
      const r = reduceRally(state.combat, action.action)
      return settleCombat(state, r.state, [...r.events])
    }
    case 'buy':
      if (state.phase !== 'shop') return reject(state, 'notPlayerTurn')
      return buy(state, action.index)
    case 'leave':
      if (state.phase !== 'shop') return reject(state, 'notPlayerTurn')
      return startFloor({ ...state, floor: state.floor + 1 })
  }
}
