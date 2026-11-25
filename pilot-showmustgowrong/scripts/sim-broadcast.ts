/**
 * 헤드리스 방송 실행(plan Task 9 Step 5).
 * 시드 1~50으로 토크쇼를 입력 없이(스위처만 10초마다 wide → close → audienceCam 순환) 끝까지 돌리고
 * 시드별 결과와 평균을 출력한다. "연쇄가 아예 안 일어나거나 매번 폭주하는" 고장만 잡는 확인이지
 * 재미 지표가 아니다.
 */
import { BROADCAST_STEPS, STEP_SECONDS } from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastInput } from '@/sim/engine'

const SEEDS = Array.from({ length: 50 }, (_, index) => index + 1)
const SWITCH_CYCLE = ['wide', 'close', 'audienceCam'] as const
const SWITCH_SECONDS = 10
const EARLY_HALT_SECONDS = 30
const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const SWITCH_STEPS = SWITCH_SECONDS * STEPS_PER_SECOND

interface SeedResult {
  seed: number
  peakViewers: number
  maxChainDepth: number
  eventCount: number
  haltedBy: string | null
  endSeconds: number
  brokenEquipment: number
}

function switcherInputs(step: number): BroadcastInput[] {
  if (step % SWITCH_STEPS !== 0) return []
  const cameraId = SWITCH_CYCLE[(step / SWITCH_STEPS) % SWITCH_CYCLE.length]
  return [{ type: 'switch', cameraId }]
}

async function runSeed(seed: number): Promise<SeedResult> {
  const broadcast = await Broadcast.create({ show: TALK_SHOW, ...LINEUP, seed })
  try {
    while (broadcast.phase === 'live') broadcast.step(switcherInputs(broadcast.currentStep))
    const summary = broadcast.summary()
    const view = broadcast.view()
    return {
      seed,
      peakViewers: summary.peakViewers,
      maxChainDepth: summary.maxChainDepth,
      eventCount: summary.eventCount,
      haltedBy: view.haltedBy,
      endSeconds: view.step / STEPS_PER_SECOND,
      brokenEquipment: view.equipment.filter((piece) => piece.released).length,
    }
  } finally {
    broadcast.dispose()
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatRow(cells: (string | number)[]): string {
  return cells.map((cell) => String(cell).padStart(10)).join(' |')
}

async function main(): Promise<void> {
  const results: SeedResult[] = []
  for (const seed of SEEDS) results.push(await runSeed(seed))

  console.log(formatRow(['seed', 'peak(천)', 'maxDepth', 'events', 'haltedBy', 'end(s)', 'broken']))
  for (const result of results) {
    console.log(
      formatRow([
        result.seed,
        result.peakViewers.toFixed(1),
        result.maxChainDepth,
        result.eventCount,
        result.haltedBy ?? '-',
        result.endSeconds.toFixed(1),
        result.brokenEquipment,
      ]),
    )
  }

  const halted = results.filter((result) => result.haltedBy !== null)
  const earlyHalted = halted.filter((result) => result.endSeconds < EARLY_HALT_SECONDS)
  const depths = results.map((result) => result.maxChainDepth)
  console.log(
    [
      `평균: 최고 시청자 ${average(results.map((result) => result.peakViewers)).toFixed(1)}천`,
      `최대 연쇄 깊이 ${average(depths).toFixed(2)}` +
        ` (최소 ${Math.min(...depths)}, 최대 ${Math.max(...depths)})`,
      `이벤트 ${average(results.map((result) => result.eventCount)).toFixed(1)}`,
      `중단 ${halted.length}/${results.length}`,
      `${EARLY_HALT_SECONDS}초 안 중단 ${earlyHalted.length}/${results.length}`,
      `장비 파손 ${average(results.map((result) => result.brokenEquipment)).toFixed(2)}`,
      `방송 길이 ${BROADCAST_STEPS / STEPS_PER_SECOND}초`,
    ].join(', '),
  )

  const failures: string[] = []
  if (average(depths) < 2) failures.push('최대 연쇄 깊이 평균이 2 미만입니다.')
  if (earlyHalted.length === results.length) failures.push('모든 시드가 30초 안에 중단됩니다.')
  if (failures.length > 0) {
    console.error(`확인 기준 미달:\n${failures.join('\n')}`)
    process.exitCode = 1
  }
}

await main()
