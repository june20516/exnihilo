/**
 * 밸런스 시뮬레이션 리포트.
 * 사용법: npm run sim -- <encounterId> [runs]
 */
import { simulate, type SimReport } from '@/kit/sim/simulate'
import { BALANCE } from '@/game/content/balance'
import { ENCOUNTERS } from '@/game/content/encounters'
import { greedyBot, passiveBot, randomBot } from '@/game/sim/bots'
import { combatGame } from '@/game/sim/combatGame'
import { combatMetrics, MAX_SIM_TURNS } from '@/game/sim/metrics'

const [encounterId = 'spider', runsArg = '200'] = process.argv.slice(2)
if (!ENCOUNTERS[encounterId]) {
  console.error(`알 수 없는 조우: ${encounterId}. 가능한 값: ${Object.keys(ENCOUNTERS).join(', ')}`)
  process.exit(1)
}
const runs = Number.parseInt(runsArg, 10)
const seeds = Array.from({ length: runs }, (_, i) => i + 1)
const game = combatGame(encounterId, BALANCE)
const bots = { passive: passiveBot, random: randomBot, greedy: greedyBot }

const pct = (x: number) => `${(x * 100).toFixed(0)}%`
const num = (x: number | undefined) => (x === undefined ? '-' : x.toFixed(1))

function topActions(report: SimReport, count: number): string {
  return Object.entries(report.actionCounts)
    .filter(([key]) => key !== 'endTurn')
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, n]) => `${key}×${n}`)
    .join(', ')
}

console.log(`조우: ${encounterId}, 시드 ${runs}개, 최대 ${MAX_SIM_TURNS}턴\n`)
console.log('봇       승률  패배  시간초과  평균턴  HP손실(전체)  HP손실(승리)')
for (const [name, bot] of Object.entries(bots)) {
  const { report } = simulate(game, bot, { seeds, maxTurns: MAX_SIM_TURNS, metrics: combatMetrics })
  console.log(
    `${name.padEnd(8)} ${pct(report.winRate).padStart(4)}  ${pct(report.lossRate).padStart(4)}  ${pct(report.timeoutRate).padStart(8)}  ` +
      `${num(report.avgTurns).padStart(6)}  ${num(report.avgMetrics.hpLost).padStart(12)}  ${num(report.avgMetricsOnWin.hpLost).padStart(12)}`,
  )
  if (name === 'greedy') console.log(`\n탐욕 봇이 많이 둔 수: ${topActions(report, 6)}`)
}
