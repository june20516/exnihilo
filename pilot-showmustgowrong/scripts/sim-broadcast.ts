/**
 * 무입력 살아 있는 스튜디오 기계 검증(living spec 7.1, plan A Task 10).
 *
 * - `npm run sim`: 입력 0개(L7, 카메라 스위처도 쓰지 않음)로 시드 1~50 × 라인업 2개(기본, 준 라인업)를
 *   끝까지 돌려 라인업별 시드 표와 게이트 결과를 출력한다. 실패한 게이트가 있으면 종료 코드 1.
 * - `npm run sim -- --log <seed> [june]`: 그 방송의 전체 로그를 극 중 시각, 줄 종류, ×N과 함께 출력한다.
 * - `npm run sim -- --tune <파일.json>`: 조정 패널의 "바뀐 값 복사" JSON으로 돌린다(--log와 함께 쓸 수 있다).
 *   쓰지 못한 조정값이 있으면 목록을 출력하고 종료 코드 2로 끝난다.
 *
 * 조정값은 앱 모듈을 불러올 때 한 번 풀리므로, 앱 모듈은 조정값을 globalThis에 둔 뒤 동적 import한다.
 */
import { readFileSync } from 'node:fs'
import type { Lineup } from '@/content/lineup'
import type { LogLine } from '@/sim/engine'
import type { BroadcastMetrics } from '@/sim/livingMetrics'

const TUNE_EXIT_CODE = 2

function parseTuneArg(args: readonly string[]): string | null {
  const index = args.indexOf('--tune')
  if (index < 0) return null
  const path = args[index + 1]
  if (path === undefined || path.startsWith('--')) {
    console.error('--tune 다음에 JSON 파일 경로가 필요합니다')
    process.exit(TUNE_EXIT_CODE)
  }
  return path
}

function readTuneFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`조정값 파일을 읽지 못했습니다: ${path}: ${reason}`)
    process.exit(TUNE_EXIT_CODE)
  }
}

const cliArgs = process.argv.slice(2)
const tunePath = parseTuneArg(cliArgs)
if (tunePath !== null) globalThis.__EXNIHILO_TUNING__ = readTuneFile(tunePath)

// 조정값을 둔 뒤에 불러온다(정적 import는 위 코드보다 먼저 평가된다)
const { changedValues } = await import('@/kit/tuning/tuning')
const { TUNABLES, TUNING } = await import('@/content/tuning')

if (TUNING.rejected.length > 0) {
  console.error(`쓰지 못한 조정값 ${TUNING.rejected.length}개:`)
  for (const item of TUNING.rejected) {
    const detail = item.detail === undefined ? '' : `: ${item.detail}`
    console.error(`  ${item.key} = ${JSON.stringify(item.value)} (${item.reason}${detail})`)
  }
  process.exit(TUNE_EXIT_CODE)
}
const changed = Object.entries(changedValues(TUNABLES, TUNING.values))
console.log(
  changed.length === 0 ? '조정값: 기본' : `조정값: ${changed.map(([key, value]) => `${key}=${value}`).join(', ')}`,
)

const { formatShowClock } = await import('@/app/labels')
const { JUNE_LINEUP, LINEUP } = await import('@/content/lineup')
const { TALK_SHOW } = await import('@/content/talkShow')
const { Broadcast } = await import('@/sim/engine')
const { evaluateGates, measureBroadcast } = await import('@/sim/livingMetrics')

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

const logArgs = parseLogArgs(cliArgs)
if (logArgs) await printLog(logArgs.seed, logArgs.june)
else await verifyAll()
