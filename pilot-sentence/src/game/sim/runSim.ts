import { createRng, type RngState } from '@/kit/core/rng'
import type { Balance } from '@/game/content/balance'
import { type FloorRecord, reduceRun, type RunAction, type RunState, startRun } from '@/game/run/run'
import type { Offer } from '@/game/run/shop'
import { twoPlyBot } from './combatBot'

export type ShopPolicy = (run: RunState, rng: RngState) => [RunAction, RngState]

export interface RunResult {
  readonly seed: number
  readonly outcome: 'won' | 'lost'
  readonly floorReached: number
  readonly bestBurst: number
  readonly purchases: readonly Offer[]
  readonly floorTurns: readonly FloorRecord[]
  readonly casts: number
  /** 연결어로 두 절을 낭독한 횟수. */
  readonly twoClauseCasts: number
}

/** 한 전투가 이 턴 수를 넘기면 교착으로 보고 진 것으로 처리한다. */
export const MAX_FIGHT_TURNS = 40
const MAX_STEPS = 20_000

/** 런 하나를 끝까지 돌린다. 전투는 두 수 앞 봇, 상점은 주어진 정책. */
export function simulateRun(seed: number, shop: ShopPolicy, balance: Balance): RunResult {
  let state = startRun(seed, balance).state
  let rng = createRng(seed ^ 0x5eed)
  let casts = 0
  let twoClauseCasts = 0
  let timedOut = false
  for (let step = 0; step < MAX_STEPS && (state.phase === 'combat' || state.phase === 'shop'); step++) {
    if (state.phase === 'shop') {
      const [action, next] = shop(state, rng)
      rng = next
      state = reduceRun(state, action, balance).state
      continue
    }
    const combat = state.combat
    if (!combat || combat.turn > MAX_FIGHT_TURNS) {
      timedOut = true
      break
    }
    const action = twoPlyBot(combat, balance)
    if (action.type === 'cast') {
      casts++
      if (combat.connective) twoClauseCasts++
    }
    state = reduceRun(state, { type: 'combat', action }, balance).state
  }
  return {
    seed,
    outcome: state.phase === 'won' && !timedOut ? 'won' : 'lost',
    floorReached: state.floor,
    bestBurst: state.log.bestBurst,
    purchases: state.log.purchases,
    floorTurns: state.log.floorTurns,
    casts,
    twoClauseCasts,
  }
}
