/**
 * 무입력 살아 있는 스튜디오 기계 검증(living spec 7.1, plan A Task 10).
 *
 * - `npm run sim`: 입력 0개(L7, 카메라 스위처도 쓰지 않음)로 시드 1~50 × 라인업 2개(기본, 준 라인업)를
 *   끝까지 돌려 라인업별 시드 표와 게이트 결과를 출력한다. 실패한 게이트가 있으면 종료 코드 1.
 * - `npm run sim -- --log <seed> [june]`: 그 방송의 전체 로그를 극 중 시각, 줄 종류, ×N과 함께 출력한다.
 */
import { formatShowClock } from '@/app/labels'
import { JUNE_LINEUP, LINEUP, type Lineup } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type LogLine } from '@/sim/engine'
import { evaluateGates, measureBroadcast, type BroadcastMetrics } from '@/sim/livingMetrics'

const SEEDS = Array.from({ length: 50 }, (_, index) => index + 1)

interface NamedLineup {
  name: string
  lineup: Lineup
}

const LINEUPS: readonly NamedLineup[] = [
  { name: '기본 라인업(렉스, 프리야, 오카포, 모)', lineup: LINEUP },
  { name: '준 라인업(렉스, 프리야, 오카포, 준)', lineup: JUNE_LINEUP },
]

interface RunResult {
  metrics: BroadcastMetrics
  lines: LogLine[]
}

async function runNoInput(lineup: Lineup, seed: number): Promise<RunResult> {
  const broadcast = await Broadcast.create({ show: TALK_SHOW, ...lineup, seed })
  try {
    while (broadcast.phase === 'live') broadcast.step([])
    const lines = broadcast.logLines()
    const metrics = measureBroadcast(
      lines,
      broadcast.burstRecords(),
      broadcast.summary(),
      broadcast.view().haltedBy !== null,
      broadcast.currentStep,
    )
    return { metrics, lines }
  } finally {
    broadcast.dispose()
  }
}

function formatRow(cells: (string | number)[]): string {
  return cells.map((cell) => String(cell).padStart(8)).join(' |')
}

function printSeedTable(results: readonly BroadcastMetrics[]): void {
  console.log(
    formatRow(['seed', 'gap(s)', 'silence', 'big', 'big/1', 'small', 'warn(s)', 'halt', 'depth', 'lines']),
  )
  results.forEach((metrics, index) => {
    const delays = metrics.warningDelaysBodySeconds.map((delay) => delay.toFixed(1)).join(',')
    console.log(
      formatRow([
        SEEDS[index],
        metrics.maxGapRealSeconds.toFixed(2),
        `${(metrics.silenceLineRatio * 100).toFixed(0)}%`,
        metrics.bigBursts,
        metrics.maxBigBurstsPerActor,
        metrics.smallBursts,
        delays || '-',
        metrics.halted ? 'yes' : '-',
        metrics.maxChainDepth,
        metrics.lineCount,
      ]),
    )
  })
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

async function verifyAll(): Promise<void> {
  let failed = false
  for (const { name, lineup } of LINEUPS) {
    const results: BroadcastMetrics[] = []
    for (const seed of SEEDS) results.push((await runNoInput(lineup, seed)).metrics)
    console.log(`\n== ${name}, 시드 ${SEEDS.length}개 무입력 ==`)
    printSeedTable(results)
    console.log(
      `평균: 큰 터짐 ${average(results.map((run) => run.bigBursts)).toFixed(2)}, ` +
        `작은 터짐 ${average(results.map((run) => run.smallBursts)).toFixed(2)}, ` +
        `줄 ${average(results.map((run) => run.lineCount)).toFixed(1)}`,
    )
    for (const gate of evaluateGates(results)) {
      console.log(`${gate.pass ? 'PASS' : 'FAIL'} ${gate.name}: ${gate.detail}`)
      if (!gate.pass) failed = true
    }
  }
  if (failed) {
    console.error('\n실패한 게이트가 있습니다.')
    process.exitCode = 1
  }
}

function formatLogLine(line: LogLine): string {
  const repeat = line.repeat > 1 ? ` ×${line.repeat}` : ''
  const indent = '  '.repeat(Math.max(0, line.depth - 1))
  return `${formatShowClock(line.step, TALK_SHOW)} [${line.kind.padEnd(8)}] ${indent}${line.text}${repeat}`
}

async function printLog(seed: number, june: boolean): Promise<void> {
  const { name, lineup } = june ? LINEUPS[1] : LINEUPS[0]
  const { metrics, lines } = await runNoInput(lineup, seed)
  console.log(`== ${name}, 시드 ${seed} 무입력 전체 로그 (${lines.length}줄) ==`)
  for (const line of lines) console.log(formatLogLine(line))
  console.log(JSON.stringify(metrics))
}

function parseLogArgs(args: readonly string[]): { seed: number; june: boolean } | null {
  const index = args.indexOf('--log')
  if (index < 0) return null
  const seed = Number(args[index + 1])
  if (!Number.isInteger(seed)) throw new Error('--log 다음에 정수 시드가 필요합니다')
  return { seed, june: args[index + 2] === 'june' }
}

const logArgs = parseLogArgs(process.argv.slice(2))
if (logArgs) await printLog(logArgs.seed, logArgs.june)
else await verifyAll()
