/**
 * 무입력 방송의 살아 있는 스튜디오 지표와 게이트(living spec 7.1, L6).
 * sim에는 실제 시간이 들어오지 않으므로 몸 초를 실제 초로 읽는다. living spec 0.3의 "실제 초"는
 * 평상시(1배) 기준이고 몸 시간도 평상시 1배이므로 둘은 같다. 무입력이어도 게이지 80%나 강도 3이면
 * 자동 슬로모션이 걸리지만, 그 구간도 평상시 기준으로 잰다.
 */
import { STEP_SECONDS } from '@/content/balance'
import type { BroadcastSummary, BroadcastView, LogLine } from './engineTypes'
import type { BurstRecord, StageRecord } from './life'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)

export interface BroadcastMetrics {
  /** 방송 시작·줄들·방송 끝 사이 가장 긴 공백(실제 초). 묶인 줄은 처음 스텝의 1줄이다 */
  maxGapRealSeconds: number
  /** kind silence 줄 수 / 전체 줄 수. 줄이 없으면 0 */
  silenceLineRatio: number
  bigBursts: number
  maxBigBurstsPerActor: number
  smallBursts: number
  /** 큰 터짐마다 2단계 진입부터 터짐까지(몸 초) */
  warningDelaysBodySeconds: number[]
  halted: boolean
  maxChainDepth: number
  lineCount: number
  /** 렉스 주목 욕구가 1단계에 한 번이라도 닿았나. 렉스가 없는 방송이면 null */
  rexAttentionReached: boolean | null
}

/** 방송 한 판을 재는 데 쓰는 기록 */
export interface BroadcastMeasureInput {
  lines: readonly LogLine[]
  bursts: readonly BurstRecord[]
  /** 엔진의 단계 진입 기록. 진입 줄은 쿨다운으로 생략될 수 있어 도달 판정은 줄이 아니라 이것으로 한다 */
  stages: readonly StageRecord[]
  summary: BroadcastSummary
  halted: boolean
  endStep: number
  /** 무대에 선 렉스의 id. 렉스가 없는 방송이면 null */
  rexId: string | null
}

/** 렉스 주목 욕구 게이트가 보는 출연자와 감정(spec Plan B1 4) */
export const REX_ID = 'rex'
const REX_ATTENTION_EMOTION = 'attention'

export interface GateResult {
  name: string
  pass: boolean
  detail: string
}

/** 범위 기준(L6): 시드의 이 비율 이상이 범위 안이면 통과 */
const RANGE_PASS_RATIO = 0.8
/** 연쇄 깊이 기준(living spec 7.1): 시드의 90%에서 최대 깊이 3 이하 */
const DEPTH_PASS_RATIO = 0.9
const MAX_CHAIN_DEPTH = 3
const MAX_HALT_RATIO = 0.1
const MAX_GAP_REAL_SECONDS = 5
const MAX_SILENCE_LINE_RATIO = 0.2
const BIG_BURSTS = { min: 1, max: 3 } as const
const MAX_BIG_BURSTS_PER_ACTOR = 1
const SMALL_BURSTS = { min: 4, max: 8 } as const
const MIN_WARNING_BODY_SECONDS = 3
const MIN_MEAN_WARNING_BODY_SECONDS = 8
/** 렉스 주목 욕구 1단계 도달 비율 기준(spec Plan B1 4): 렉스가 있는 판의 40~60% */
const REX_ATTENTION_RATIO = { min: 0.4, max: 0.6 } as const

function stepsToSeconds(steps: number): number {
  return steps / STEPS_PER_SECOND
}

function maxGapSteps(lines: readonly LogLine[], endStep: number): number {
  const marks = [0, ...lines.map((line) => line.step), endStep]
  let maxGap = 0
  for (let index = 1; index < marks.length; index += 1) {
    maxGap = Math.max(maxGap, marks[index] - marks[index - 1])
  }
  return maxGap
}

function warningDelay(record: BurstRecord): number {
  if (record.stage2Step === null) {
    throw new Error(`2단계 진입 스텝이 없는 큰 터짐입니다: ${record.actorId} ${record.step}`)
  }
  return stepsToSeconds(record.step - record.stage2Step)
}

function rexAttentionReached(stages: readonly StageRecord[], rexId: string | null): boolean | null {
  if (rexId === null) return null
  // 2단계 기록도 1단계를 지난 것이다(한 틱에 0에서 2로 오르면 2만 남는다)
  return stages.some((record) => record.actorId === rexId && record.emotion === REX_ATTENTION_EMOTION)
}

export function measureBroadcast({
  lines,
  bursts,
  stages,
  summary,
  halted,
  endStep,
  rexId,
}: BroadcastMeasureInput): BroadcastMetrics {
  const big = bursts.filter((record) => record.size === 'big')
  const bigPerActor = new Map<string, number>()
  for (const record of big) {
    bigPerActor.set(record.actorId, (bigPerActor.get(record.actorId) ?? 0) + 1)
  }
  const silenceLines = lines.filter((line) => line.kind === 'silence').length
  return {
    maxGapRealSeconds: stepsToSeconds(maxGapSteps(lines, endStep)),
    silenceLineRatio: lines.length === 0 ? 0 : silenceLines / lines.length,
    bigBursts: big.length,
    maxBigBurstsPerActor: Math.max(0, ...bigPerActor.values()),
    smallBursts: bursts.length - big.length,
    warningDelaysBodySeconds: big.map(warningDelay),
    halted,
    maxChainDepth: summary.maxChainDepth,
    lineCount: lines.length,
    rexAttentionReached: rexAttentionReached(stages, rexId),
  }
}

/** 끝난 방송에서 재는 데 필요한 것만 본다(engine을 값으로 import하지 않으려고 구조로 받는다) */
export interface FinishedBroadcast {
  logLines(): LogLine[]
  burstRecords(): BurstRecord[]
  stageRecords(): StageRecord[]
  summary(): BroadcastSummary
  view(): BroadcastView
  readonly currentStep: number
}

/** 끝난 방송 한 판을 잰다. performers는 무대에 선 출연자로, 렉스가 있는지 가린다 */
export function measureFinishedBroadcast(
  broadcast: FinishedBroadcast,
  performers: readonly { id: string }[],
): BroadcastMetrics {
  return measureBroadcast({
    lines: broadcast.logLines(),
    bursts: broadcast.burstRecords(),
    stages: broadcast.stageRecords(),
    summary: broadcast.summary(),
    halted: broadcast.view().haltedBy !== null,
    endStep: broadcast.currentStep,
    rexId: performers.some((performer) => performer.id === REX_ID) ? REX_ID : null,
  })
}

/** 조건을 만족하는 시드가 비율 이상이면 통과 */
function ratioGate(
  name: string,
  runs: readonly BroadcastMetrics[],
  within: (run: BroadcastMetrics) => boolean,
  passRatio: number,
  criterion: string,
): GateResult {
  const count = runs.filter(within).length
  return {
    name,
    pass: count >= runs.length * passRatio,
    detail: `${criterion}: ${count}/${runs.length} (기준 ${passRatio * 100}% 이상)`,
  }
}

function rexAttentionGate(runs: readonly BroadcastMetrics[]): GateResult {
  const name = '렉스 주목 욕구'
  const withRex = runs.filter((run) => run.rexAttentionReached !== null)
  if (withRex.length === 0) return { name, pass: false, detail: '렉스가 있는 방송이 없어 비율을 낼 수 없음' }
  const reached = withRex.filter((run) => run.rexAttentionReached === true).length
  const ratio = reached / withRex.length
  return {
    name,
    pass: ratio >= REX_ATTENTION_RATIO.min && ratio <= REX_ATTENTION_RATIO.max,
    detail:
      `1단계 도달 ${reached}/${withRex.length} = ${(ratio * 100).toFixed(0)}%` +
      `(기준 ${REX_ATTENTION_RATIO.min * 100}~${REX_ATTENTION_RATIO.max * 100}%)`,
  }
}

function warningGate(runs: readonly BroadcastMetrics[]): GateResult {
  const delays = runs.flatMap((run) => run.warningDelaysBodySeconds)
  const name = '경고 창'
  if (delays.length === 0) return { name, pass: false, detail: '큰 터짐이 없어 평균을 낼 수 없음' }
  const shortest = Math.min(...delays)
  const mean = delays.reduce((sum, delay) => sum + delay, 0) / delays.length
  return {
    name,
    pass: shortest >= MIN_WARNING_BODY_SECONDS && mean >= MIN_MEAN_WARNING_BODY_SECONDS,
    detail:
      `최소 ${shortest.toFixed(2)}초(기준 ${MIN_WARNING_BODY_SECONDS} 이상), ` +
      `평균 ${mean.toFixed(2)}초(기준 ${MIN_MEAN_WARNING_BODY_SECONDS} 이상), 큰 터짐 ${delays.length}회`,
  }
}

export function evaluateGates(runs: readonly BroadcastMetrics[]): GateResult[] {
  const halted = runs.filter((run) => run.halted).length
  const worstGap = Math.max(0, ...runs.map((run) => run.maxGapRealSeconds))
  return [
    {
      name: '로그 공백',
      pass: worstGap <= MAX_GAP_REAL_SECONDS,
      detail: `가장 긴 공백 ${worstGap.toFixed(2)}초(기준 모든 시드 ${MAX_GAP_REAL_SECONDS}초 이하)`,
    },
    ratioGate(
      '정적 줄',
      runs,
      (run) => run.silenceLineRatio <= MAX_SILENCE_LINE_RATIO,
      RANGE_PASS_RATIO,
      `정적 줄 ${MAX_SILENCE_LINE_RATIO * 100}% 이하`,
    ),
    ratioGate(
      '큰 터짐 수',
      runs,
      (run) => run.bigBursts >= BIG_BURSTS.min && run.bigBursts <= BIG_BURSTS.max,
      RANGE_PASS_RATIO,
      `${BIG_BURSTS.min}~${BIG_BURSTS.max}회`,
    ),
    ratioGate(
      '출연자당 큰 터짐',
      runs,
      (run) => run.maxBigBurstsPerActor <= MAX_BIG_BURSTS_PER_ACTOR,
      RANGE_PASS_RATIO,
      `출연자당 ${MAX_BIG_BURSTS_PER_ACTOR}회 이하`,
    ),
    ratioGate(
      '작은 터짐 수',
      runs,
      (run) => run.smallBursts >= SMALL_BURSTS.min && run.smallBursts <= SMALL_BURSTS.max,
      RANGE_PASS_RATIO,
      `${SMALL_BURSTS.min}~${SMALL_BURSTS.max}회`,
    ),
    {
      name: '중단',
      pass: halted <= runs.length * MAX_HALT_RATIO,
      detail: `중단 ${halted}/${runs.length}(기준 ${MAX_HALT_RATIO * 100}% 이하)`,
    },
    ratioGate(
      '연쇄 깊이',
      runs,
      (run) => run.maxChainDepth <= MAX_CHAIN_DEPTH,
      DEPTH_PASS_RATIO,
      `최대 깊이 ${MAX_CHAIN_DEPTH} 이하`,
    ),
    warningGate(runs),
    rexAttentionGate(runs),
  ]
}
