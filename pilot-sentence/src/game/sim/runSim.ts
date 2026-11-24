import { FLOORS } from '@/game/run/floors'
import { createRng, type RngState } from '@/kit/core/rng'
import { type FloorRecord, reduceRun, type RunAction, type RunState, startRun } from '@/game/run/run'
import type { Offer } from '@/game/run/shop'
import { getWord } from '@/game/content/words'
import { basicVerbAvailable, type RallyState } from '@/game/rally/combat'
import { isBlank } from '@/game/rally/sentence'
import { getSlot } from '@/game/sentence/board'
import { isAttackOnlyAction } from './bots'
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
  /** 전투 턴 한계나 전체 단계 한계에 걸려 끝났다(패배로 센다). */
  readonly timedOut: boolean
  /** 상점 새로고침 횟수. */
  readonly rerolls: number
  /** 지원 동사(보호·회복·상태 등)가 들어간 낭독 횟수. */
  readonly supportCasts: number
  /** 서고가 바닥나 잃은 HP의 합(모든 전투). */
  readonly emptyDrawHpLost: number
  /** 떠올리기로 서고에 되돌린 카드 수의 합. */
  readonly recalledCards: number
  /** 되받아친다(보호를 위력으로 쓰는 동사)가 들어간 낭독 횟수. */
  readonly counterCasts: number
  /** 기본 동사를 놓은 낭독 횟수. */
  readonly basicVerbCasts: number
}

/** 한 전투가 이 턴 수를 넘기면 교착으로 보고 진 것으로 처리한다. */
export const MAX_FIGHT_TURNS = 40
const MAX_STEPS = 20_000

/** 런 하나를 끝까지 돌린다. 전투는 두 수 앞 봇, 상점은 주어진 정책. */
/** 전투 정책: full은 두 수 앞 봇, attackOnly는 그 봇이 피해 동사만 쓰게 거른 것(v3 판정 지표). */
export type CombatMode = 'full' | 'attackOnly'

/** 이 낭독의 동사 정의들(빈 동사 칸은 빼고). */
function castVerbs(state: RallyState) {
  return state.board.clauses.flatMap((_, clause) => {
    const head = getSlot(state.board, { clause, role: 'verb' }).head
    if (isBlank(head)) return []
    const effect = getWord(head.wordId).effect
    return effect.type === 'verb' ? [effect] : []
  })
}

/** 이 낭독에 지원 동사가 들어 있는가. */
function castsSupportVerb(state: RallyState): boolean {
  return castVerbs(state).some((v) => v.range === 'support')
}

/** 이 낭독에 되받아친다(counter 동작)가 들어 있는가. 단어 id가 아니라 동작 종류로 본다. */
function castsCounter(state: RallyState): boolean {
  return castVerbs(state).some((v) => v.actions.some((a) => a.kind === 'counter'))
}

export function simulateRun(seed: number, shop: ShopPolicy, maxFightTurns = MAX_FIGHT_TURNS, combatMode: CombatMode = 'full'): RunResult {
  const allow = combatMode === 'attackOnly' ? isAttackOnlyAction : undefined
  let state = startRun(seed).state
  let rng = createRng(seed ^ 0x5eed)
  let casts = 0
  let twoClauseCasts = 0
  let rerolls = 0
  let supportCasts = 0
  let counterCasts = 0
  let emptyDrawHpLost = 0
  let recalledCards = 0
  let basicVerbCasts = 0
  let timedOut = false
  let floorTurns = [...state.log.floorTurns]
  let step = 0
  for (; step < MAX_STEPS && (state.phase === 'combat' || state.phase === 'shop'); step++) {
    if (state.phase === 'shop') {
      const [action, next] = shop(state, rng)
      rng = next
      if (action.type === 'reroll') rerolls++
      state = reduceRun(state, action).state
      continue
    }
    const combat = state.combat
    if (!combat || combat.turn > maxFightTurns) {
      // 교착으로 끝난 전투도 층별 턴에 남긴다. 빠지면 가장 긴 전투가 평균에서 사라진다.
      if (combat) floorTurns = [...state.log.floorTurns, { floor: state.floor, tier: FLOORS[state.floor - 1]?.tier ?? 'normal', turns: combat.turn }]
      timedOut = true
      break
    }
    const action = twoPlyBot(combat, allow)
    if (action.type === 'cast') {
      casts++
      if (combat.connective) twoClauseCasts++
      if (castsSupportVerb(combat)) supportCasts++
      if (castsCounter(combat)) counterCasts++
      if (!basicVerbAvailable(combat)) basicVerbCasts++
    }
    const result = reduceRun(state, { type: 'combat', action })
    for (const e of result.events) {
      if (e.type === 'emptyDraw') emptyDrawHpLost += e.hpLost
      if (e.type === 'recalled') recalledCards += e.count
    }
    state = result.state
  }
  if (step >= MAX_STEPS) timedOut = true
  if (!timedOut) floorTurns = [...state.log.floorTurns]
  return {
    seed,
    outcome: state.phase === 'won' && !timedOut ? 'won' : 'lost',
    floorReached: state.floor,
    bestBurst: state.log.bestBurst,
    purchases: state.log.purchases,
    floorTurns,
    casts,
    twoClauseCasts,
    timedOut,
    rerolls,
    supportCasts,
    emptyDrawHpLost,
    recalledCards,
    counterCasts,
    basicVerbCasts,
  }
}
