/**
 * 기본 랠리 기계 검증 리포트 (v2 spec §7).
 * 사용법: npm run sim -- [encounterId|all] [runs]
 */
import { simulate } from '@/kit/sim/simulate'
import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import { greedyBot, passiveBot, randomBot } from '@/game/sim/bots'
import { combatGame } from '@/game/sim/combatGame'
import { combatMetrics, combatTurnMetrics, MAX_SIM_TURNS } from '@/game/sim/metrics'

const [encounterArg = 'all', runsArg = '100'] = process.argv.slice(2)
const runs = Number.parseInt(runsArg, 10)
if (!Number.isInteger(runs) || runs <= 0) {
  console.error(`runs는 양의 정수여야 합니다: ${runsArg}`)
  process.exit(1)
}
const encounterIds = encounterArg === 'all' ? Object.keys(RALLY_ENCOUNTERS).filter((id) => !id.startsWith('test-')) : [encounterArg]
for (const id of encounterIds) {
  if (!RALLY_ENCOUNTERS[id]) {
    console.error(`알 수 없는 조우: ${id}. 가능한 값: all, ${Object.keys(RALLY_ENCOUNTERS).join(', ')}`)
    process.exit(1)
  }
}

const seeds = Array.from({ length: runs }, (_, i) => i + 1)
const pct = (x: number | undefined) => `${((x ?? 0) * 100).toFixed(0)}%`.padStart(5)
const num = (x: number | undefined, width = 6) => (x === undefined ? '-' : x.toFixed(1)).padStart(width)

console.log(`시드 ${runs}개, 최대 ${MAX_SIM_TURNS}턴. 탐욕 봇 기준 지표 + 무작위/무행동 승률\n`)
console.log('조우       승률 HP손실(승) 평균턴 시간초과 동사없는턴 방어율 최대한방 선택지수 뻔한최선 무작위 무행동')
for (const encounterId of encounterIds) {
  const game = combatGame(encounterId)
  const greedy = simulate(game, greedyBot, { seeds, maxTurns: MAX_SIM_TURNS, metrics: combatMetrics, turnMetrics: combatTurnMetrics(game) }).report
  const random = simulate(game, randomBot, { seeds, maxTurns: MAX_SIM_TURNS, metrics: combatMetrics }).report
  const passive = simulate(game, passiveBot, { seeds, maxTurns: MAX_SIM_TURNS, metrics: combatMetrics }).report
  const m = greedy.avgMetrics
  const t = greedy.avgTurnMetrics
  console.log(
    `${encounterId.padEnd(8)} ${pct(greedy.winRate)} ${num(greedy.avgMetricsOnWin.hpLost, 10)} ${num(greedy.avgTurns)} ${pct(greedy.timeoutRate).padStart(8)}` +
      ` ${pct(m.deadTurnRate).padStart(10)} ${pct(m.defendRate).padStart(6)} ${num(m.bestBurst, 8)} ${num(t.choiceDiversity, 8)} ${pct(t.obviousBest).padStart(8)} ${pct(random.winRate)} ${pct(passive.winRate)}`,
  )
}
