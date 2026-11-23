import { simulate } from '@/kit/sim/simulate'
import { BALANCE } from '@/game/content/balance'
import { greedyBot, passiveBot, randomBot } from './bots'
import { combatGame } from './combatGame'
import { combatMetrics, MAX_SIM_TURNS } from './metrics'
import { BALANCE_TARGETS as T } from './targets'

/**
 * 기본 규칙 게이트 (v2 spec §7). 거미에만 건다. 거미 떼와 슬라임은 sim 리포트로 보고만 한다.
 */
const seeds = Array.from({ length: 60 }, (_, i) => i + 1)
const within = (value: number, [min, max]: readonly [number, number]) => value >= min && value <= max

describe('기본 규칙 게이트: 거미', () => {
  const game = combatGame('spider', BALANCE)
  const options = { seeds, maxTurns: MAX_SIM_TURNS, metrics: combatMetrics }
  const greedy = simulate(game, greedyBot, options).report
  const summary = {
    winRate: greedy.winRate,
    hpLostOnWin: greedy.avgMetricsOnWin.hpLost ?? 0,
    avgTurns: greedy.avgTurns,
    deadTurnRate: greedy.avgMetrics.deadTurnRate ?? 0,
    defendRate: greedy.avgMetrics.defendRate ?? 0,
  }
  const label = JSON.stringify(summary)

  test('탐욕 봇 승률', () => expect(within(summary.winRate, T.greedyWinRate), label).toBe(true))
  test('이겼을 때 HP 손실', () => expect(within(summary.hpLostOnWin, T.greedyHpLostOnWin), label).toBe(true))
  test('평균 턴', () => expect(within(summary.avgTurns, T.avgTurns), label).toBe(true))
  test('동사 없는 턴', () => expect(summary.deadTurnRate, label).toBeLessThanOrEqual(T.maxDeadTurnRate))
  test('방어 계열 동사를 고른 비율', () => expect(within(summary.defendRate, T.defendRate), label).toBe(true))
  test('아무것도 하지 않으면 이길 수 없다', () => expect(simulate(game, passiveBot, options).report.winRate).toBe(0))
  test('무작위 봇은 탐욕 봇보다 20%p 이상 낮다', () => {
    const random = simulate(game, randomBot, options).report.winRate
    expect(random, `${random} vs ${summary.winRate}`).toBeLessThanOrEqual(summary.winRate - T.minGreedyEdge)
  })
})
