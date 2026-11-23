import { simulate } from '@/kit/sim/simulate'
import { BALANCE } from '@/game/content/balance'
import { greedyBot, passiveBot } from './bots'
import { combatGame } from './combatGame'
import { combatMetrics, MAX_SIM_TURNS } from './metrics'
import { BALANCE_TARGETS } from './targets'

const seeds = Array.from({ length: 100 }, (_, i) => i + 1)
const within = (value: number, [min, max]: readonly [number, number]) => value >= min && value <= max

describe('밸런스 게이트: spider', () => {
  const game = combatGame('spider', BALANCE)
  const options = { seeds, maxTurns: MAX_SIM_TURNS, metrics: combatMetrics }

  test('탐욕 봇 승률과 승리 시 HP 손실이 목표 범위 안', () => {
    const { report } = simulate(game, greedyBot, options)
    const summary = { winRate: report.winRate, hpLostOnWin: report.avgMetricsOnWin.hpLost ?? 0 }
    expect(summary, JSON.stringify(summary)).toSatisfy(
      (s: typeof summary) =>
        within(s.winRate, BALANCE_TARGETS.greedyWinRate) && within(s.hpLostOnWin, BALANCE_TARGETS.greedyHpLostOnWin),
    )
  })

  test('아무것도 하지 않으면 이길 수 없다', () => {
    const { report } = simulate(game, passiveBot, options)
    expect(within(report.winRate, BALANCE_TARGETS.passiveWinRate)).toBe(true)
  })
})
