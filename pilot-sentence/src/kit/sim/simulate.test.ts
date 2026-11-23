import { nextInt } from '@/kit/core/rng'
import { type Policy, type SimGame, simulate } from './simulate'

interface Counter {
  value: number
  turn: number
}
type CounterAction = 'inc' | 'end'

/** 'inc'는 값 +1, 'end'는 턴 +1. 값이 3이면 승리. */
const counterGame: SimGame<Counter, CounterAction> = {
  start: () => ({ value: 0, turn: 1 }),
  apply: (s, a) => (a === 'inc' ? { ...s, value: s.value + 1 } : { ...s, turn: s.turn + 1 }),
  legalActions: () => ['inc', 'end'],
  outcome: (s) => (s.value >= 3 ? 'won' : null),
  turn: (s) => s.turn,
  actionKey: (a) => a,
}

const alwaysInc: Policy<Counter, CounterAction> = (_g, _s, rng) => ['inc', rng]
const alwaysEnd: Policy<Counter, CounterAction> = (_g, _s, rng) => ['end', rng]
const metrics = (s: Counter) => ({ value: s.value })

test('항상 inc하면 모두 승리하고 행동 빈도가 집계된다', () => {
  const { report, runs } = simulate(counterGame, alwaysInc, { seeds: [1, 2, 3], maxTurns: 10, metrics })
  expect(report.runs).toBe(3)
  expect(report.winRate).toBe(1)
  expect(report.avgTurns).toBe(1)
  expect(report.actionCounts).toEqual({ inc: 9 })
  expect(report.avgMetricsOnWin.value).toBe(3)
  expect(runs[0]).toMatchObject({ seed: 1, outcome: 'won', turns: 1 })
})

test('끝나지 않는 게임은 maxTurns를 넘으면 timeout으로 집계된다', () => {
  const { report } = simulate(counterGame, alwaysEnd, { seeds: [1, 2], maxTurns: 5, metrics })
  expect(report.timeoutRate).toBe(1)
  expect(report.winRate).toBe(0)
})

test('같은 시드면 같은 리포트', () => {
  const coin: Policy<Counter, CounterAction> = (_g, _s, rng) => {
    const [n, next] = nextInt(rng, 0, 1)
    return [n === 0 ? 'inc' : 'end', next]
  }
  const a = simulate(counterGame, coin, { seeds: [7, 8, 9], maxTurns: 20, metrics }).report
  const b = simulate(counterGame, coin, { seeds: [7, 8, 9], maxTurns: 20, metrics }).report
  expect(a).toEqual(b)
})
