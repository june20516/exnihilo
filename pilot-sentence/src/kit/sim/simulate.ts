import { createRng, type RngState } from '@/kit/core/rng'

/** 시뮬레이터가 게임을 다루는 최소한의 어댑터. */
export interface SimGame<S, A> {
  start(seed: number): S
  apply(state: S, action: A): S
  legalActions(state: S): A[]
  outcome(state: S): 'won' | 'lost' | null
  turn(state: S): number
  actionKey(action: A): string
}

export type Policy<S, A> = (game: SimGame<S, A>, state: S, rng: RngState) => [A, RngState]

export interface RunResult {
  readonly seed: number
  readonly outcome: 'won' | 'lost' | 'timeout'
  readonly turns: number
  readonly metrics: Record<string, number>
}

export interface SimReport {
  readonly runs: number
  readonly winRate: number
  readonly lossRate: number
  readonly timeoutRate: number
  readonly avgTurns: number
  readonly avgMetrics: Record<string, number>
  readonly avgMetricsOnWin: Record<string, number>
  readonly actionCounts: Record<string, number>
}

export interface SimOptions<S> {
  readonly seeds: readonly number[]
  readonly maxTurns: number
  readonly metrics: (state: S) => Record<string, number>
}

/** 한 턴에 허용하는 최대 행동 수. 턴을 넘기지 않는 정책이 무한 루프에 빠지지 않게 한다. */
const MAX_ACTIONS_PER_TURN = 50

function average(values: readonly Record<string, number>[]): Record<string, number> {
  if (values.length === 0) return {}
  const sums: Record<string, number> = {}
  for (const record of values) {
    for (const [key, value] of Object.entries(record)) sums[key] = (sums[key] ?? 0) + value
  }
  return Object.fromEntries(Object.entries(sums).map(([key, sum]) => [key, sum / values.length]))
}

function rate(runs: readonly RunResult[], outcome: RunResult['outcome']): number {
  return runs.length === 0 ? 0 : runs.filter((r) => r.outcome === outcome).length / runs.length
}

export function simulate<S, A>(
  game: SimGame<S, A>,
  policy: Policy<S, A>,
  options: SimOptions<S>,
): { report: SimReport; runs: RunResult[] } {
  const actionCounts: Record<string, number> = {}
  const runs: RunResult[] = options.seeds.map((seed) => {
    let state = game.start(seed)
    let rng = createRng(seed ^ 0x5eed)
    let actions = 0
    while (game.outcome(state) === null && game.turn(state) <= options.maxTurns) {
      if (actions >= options.maxTurns * MAX_ACTIONS_PER_TURN) break
      const [action, nextRng] = policy(game, state, rng)
      rng = nextRng
      const key = game.actionKey(action)
      actionCounts[key] = (actionCounts[key] ?? 0) + 1
      state = game.apply(state, action)
      actions++
    }
    return {
      seed,
      outcome: game.outcome(state) ?? 'timeout',
      turns: game.turn(state),
      metrics: options.metrics(state),
    }
  })

  const report: SimReport = {
    runs: runs.length,
    winRate: rate(runs, 'won'),
    lossRate: rate(runs, 'lost'),
    timeoutRate: rate(runs, 'timeout'),
    avgTurns: runs.length === 0 ? 0 : runs.reduce((sum, r) => sum + r.turns, 0) / runs.length,
    avgMetrics: average(runs.map((r) => r.metrics)),
    avgMetricsOnWin: average(runs.filter((r) => r.outcome === 'won').map((r) => r.metrics)),
    actionCounts,
  }
  return { report, runs }
}
