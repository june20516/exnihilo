/**
 * 무입력 살아 있는 스튜디오 기계 검증(living spec 7.1, plan A Task 10, Plan B1 spec 2.4·4).
 *
 * - `npm run sim`: 플레이어 입력 없이 자동 PD(일어난 일을 따라 카메라를 돌림)만 카메라를 바꾸는 방송으로 시드 1~50 ×
 *   라인업 2개(기본, 준 라인업)를 끝까지 돌려 라인업별 시드 표와 게이트 결과를 출력한다. 렉스 주목 욕구 게이트는
 *   기본 라인업에만 걸고 준 라인업은 비율만 출력한다. 이어서 고정 와이드(카메라를 바꾸지 않음) 방송을 참고로 출력한다
 *   (게이트 없음, 종료 코드에 영향 없음). 실패한 게이트가 있으면 종료 코드 1.
 * - `npm run sim -- --fixed`: 고정 와이드 방송만 돌리고 living spec 7.1 게이트를 건다(렉스 게이트는 비율만 출력).
 * - `npm run sim -- --log <seed> [june]`: 그 자동 PD 방송의 전체 로그를 극 중 시각, 줄 종류, ×N과 함께 출력한다.
 *   `--fixed`와 함께 쓰면 고정 와이드 방송의 로그다.
 * - `npm run sim -- --tune <파일.json>`: 조정 패널의 "바뀐 값 복사" JSON으로 돌린다(--log, --fixed와 함께 쓸 수 있다).
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
const { STEP_SECONDS } = await import('@/content/balance')
const { JUNE_LINEUP, LINEUP } = await import('@/content/lineup')
const { TALK_SHOW } = await import('@/content/talkShow')
const { Broadcast } = await import('@/sim/engine')
const { AutoDirector } = await import('@/sim/autoDirector')
const { evaluateGates, measureFinishedBroadcast } = await import('@/sim/livingMetrics')

/** 렉스 게이트 이름(livingMetrics). 기본 라인업 자동 PD 방송에만 건다 */
const REX_GATE_NAME = '렉스 주목 욕구'

const SEEDS = Array.from({ length: 50 }, (_, index) => index + 1)

interface NamedLineup {
  name: string
  lineup: Lineup
  /** 렉스 주목 욕구 게이트를 거나(spec Plan B1 4: 기본 라인업만). 아니면 비율만 출력한다 */
  rexGate: boolean
}

const LINEUPS: readonly NamedLineup[] = [
  { name: '기본 라인업(렉스, 프리야, 오카포, 모)', lineup: LINEUP, rexGate: true },
  { name: '준 라인업(렉스, 프리야, 오카포, 준)', lineup: JUNE_LINEUP, rexGate: false },
]

/**
 * 자동 PD를 부르는 간격: 6스텝 = 몸 0.1초. 매 스텝 view()를 만들면 방송 한 판이 고정 와이드의 약 2배 걸린다.
 * 자동 PD는 시간을 view.step 차이로 재고 컷 최소 유지가 몸 1.5초라 0.1초 늦게 보는 것은 컷에 거의 영향이 없다.
 */
const DIRECTOR_INTERVAL_STEPS = Math.round(0.1 / STEP_SECONDS)

/** auto: 자동 PD가 카메라를 돌린다. fixed: 카메라를 바꾸지 않는다(방송 시작 송출인 와이드 고정) */
type CameraMode = 'auto' | 'fixed'

const MODE_LABELS: Record<CameraMode, string> = {
  auto: '자동 PD',
  fixed: '고정 와이드',
}

interface RunResult {
  metrics: BroadcastMetrics
  lines: LogLine[]
}

async function runNoInput(lineup: Lineup, seed: number, mode: CameraMode): Promise<RunResult> {
  const broadcast = await Broadcast.create({ show: TALK_SHOW, ...lineup, seed })
  try {
    const performerOrder = lineup.performers.map((performer) => performer.id)
    const director = mode === 'auto' ? new AutoDirector(TALK_SHOW, performerOrder) : null
    while (broadcast.phase === 'live') {
      const directorTurn = director !== null && broadcast.currentStep % DIRECTOR_INTERVAL_STEPS === 0
      broadcast.step(directorTurn ? director.decide(broadcast.view()) : [])
    }
    return {
      metrics: measureFinishedBroadcast(broadcast, lineup.performers),
      lines: broadcast.logLines(),
    }
  } finally {
    broadcast.dispose()
  }
}

function formatRow(cells: (string | number)[]): string {
  return cells.map((cell) => String(cell).padStart(8)).join(' |')
}

function printSeedTable(results: readonly BroadcastMetrics[]): void {
  console.log(
    formatRow(['seed', 'gap(s)', 'silence', 'big', 'big/1', 'small', 'warn(s)', 'halt', 'depth', 'lines', 'rex']),
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
        metrics.rexAttentionReached === null ? 'n/a' : metrics.rexAttentionReached ? 'yes' : '-',
      ]),
    )
  })
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

interface LineupResult {
  name: string
  runs: BroadcastMetrics[]
}

async function runLineups(mode: CameraMode): Promise<LineupResult[]> {
  const results: LineupResult[] = []
  for (const { name, lineup } of LINEUPS) {
    const runs: BroadcastMetrics[] = []
    for (const seed of SEEDS) runs.push((await runNoInput(lineup, seed, mode)).metrics)
    results.push({ name, runs })
  }
  return results
}

function printLineupTable(title: string, runs: readonly BroadcastMetrics[]): void {
  console.log(`\n== ${title} ==`)
  printSeedTable(runs)
  console.log(
    `평균: 큰 터짐 ${average(runs.map((run) => run.bigBursts)).toFixed(2)}, ` +
      `작은 터짐 ${average(runs.map((run) => run.smallBursts)).toFixed(2)}, ` +
      `줄 ${average(runs.map((run) => run.lineCount)).toFixed(1)}`,
  )
}

/** 게이트를 출력하고 실패한 게이트가 있었는지 돌려준다. rexGate가 아니면 렉스 게이트는 비율만 참고로 출력한다 */
function printGates(runs: readonly BroadcastMetrics[], rexGate: boolean): boolean {
  let failed = false
  for (const gate of evaluateGates(runs)) {
    if (gate.name === REX_GATE_NAME && !rexGate) {
      console.log(`참고 ${gate.name}: ${gate.detail}`)
      continue
    }
    console.log(`${gate.pass ? 'PASS' : 'FAIL'} ${gate.name}: ${gate.detail}`)
    if (!gate.pass) failed = true
  }
  return failed
}

/** 기본(자동 PD에 게이트, 고정 와이드는 참고) 또는 --fixed(고정 와이드에 게이트) */
async function verifyAll(gatedMode: CameraMode): Promise<void> {
  let failed = false
  const gated = await runLineups(gatedMode)
  gated.forEach(({ name, runs }, index) => {
    printLineupTable(`${name}, 시드 ${SEEDS.length}개 무입력 ${MODE_LABELS[gatedMode]}`, runs)
    // 렉스 게이트의 목표 방송은 자동 PD 기본 라인업이다(spec Plan B1 4). 고정 와이드는 비율만 출력한다
    const rexGate = gatedMode === 'auto' && LINEUPS[index].rexGate
    if (printGates(runs, rexGate)) failed = true
  })
  if (gatedMode === 'auto') {
    console.log('\n#### 참고: 고정 와이드(게이트 없음, 종료 코드에 영향 없음) ####')
    for (const { name, runs } of await runLineups('fixed')) {
      printLineupTable(`참고: ${name}, 시드 ${SEEDS.length}개 무입력 고정 와이드`, runs)
      for (const gate of evaluateGates(runs)) {
        console.log(`참고 ${gate.pass ? 'pass' : 'fail'} ${gate.name}: ${gate.detail}`)
      }
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

async function printLog(seed: number, june: boolean, mode: CameraMode): Promise<void> {
  const { name, lineup } = june ? LINEUPS[1] : LINEUPS[0]
  const { metrics, lines } = await runNoInput(lineup, seed, mode)
  console.log(`== ${name}, 시드 ${seed} 무입력 ${MODE_LABELS[mode]} 전체 로그 (${lines.length}줄) ==`)
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

const cameraMode: CameraMode = cliArgs.includes('--fixed') ? 'fixed' : 'auto'
const logArgs = parseLogArgs(cliArgs)
if (logArgs) await printLog(logArgs.seed, logArgs.june, cameraMode)
else await verifyAll(cameraMode)
