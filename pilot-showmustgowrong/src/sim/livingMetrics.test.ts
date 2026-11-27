import { describe, expect, it } from 'vitest'
import { STEP_SECONDS } from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastSummary, type LogKind, type LogLine } from './engine'
import type { BurstRecord, StageRecord } from './life'
import {
  evaluateGates,
  measureBroadcast,
  measureFinishedBroadcast,
  type BroadcastMeasureInput,
  type BroadcastMetrics,
} from './livingMetrics'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const seconds = (value: number) => Math.round(value * STEPS_PER_SECOND)

function line(step: number, kind: LogKind = 'habit', repeat = 1): LogLine {
  return {
    index: 0,
    step,
    text: `줄 ${step}`,
    kind,
    emotion: null,
    stage: null,
    repeat,
    depth: 0,
    eventId: null,
    lastEventId: null,
    leadIn: null,
    actorId: null,
    x: 0,
    y: 0,
    z: 0,
  }
}

function burst(
  step: number,
  actorId: string,
  size: 'small' | 'big',
  stage2Step: number | null = null,
): BurstRecord {
  return { step, actorId, emotion: 'irritation', size, stage2Step }
}

function summary(maxChainDepth: number): BroadcastSummary {
  return { peakViewers: 0, averageViewers: 0, eventCount: 0, maxChainDepth, rootLine: null }
}

function stage(step: number, actorId: string, emotion: StageRecord['emotion'], to: 1 | 2): StageRecord {
  return { step, actorId, emotion, stage: to }
}

/** 빈 방송 입력에 필요한 칸만 덮어 잰다. 렉스는 기본으로 무대에 있다 */
function measure(overrides: Partial<BroadcastMeasureInput> & Pick<BroadcastMeasureInput, 'endStep'>) {
  return measureBroadcast({
    lines: [],
    bursts: [],
    stages: [],
    summary: summary(0),
    halted: false,
    rexId: 'rex',
    ...overrides,
  })
}

/** 렉스 게이트 밖의 모든 게이트를 통과하는 지표 한 판. 렉스 판정은 판 비율이라 기본은 렉스 없음(null)이다 */
function passing(overrides: Partial<BroadcastMetrics> = {}): BroadcastMetrics {
  return {
    maxGapRealSeconds: 4,
    silenceLineRatio: 0.1,
    bigBursts: 2,
    maxBigBurstsPerActor: 1,
    smallBursts: 6,
    warningDelaysBodySeconds: [11, 12],
    halted: false,
    maxChainDepth: 2,
    lineCount: 60,
    rexAttentionReached: null,
    ...overrides,
  }
}

/** count판 중 앞의 failing판만 overrides를 적용한다 */
function runsWith(failing: number, overrides: Partial<BroadcastMetrics>, count = 50) {
  return Array.from({ length: count }, (_, index) =>
    index < failing ? passing(overrides) : passing(),
  )
}

function gate(runs: readonly BroadcastMetrics[], name: string) {
  const result = evaluateGates(runs).find((candidate) => candidate.name === name)
  if (!result) throw new Error(`게이트가 없습니다: ${name}`)
  return result
}

describe('measureBroadcast', () => {
  it('방송 시작·줄들·방송 끝 사이 가장 긴 공백을 실제 초로 잰다', () => {
    const lines = [line(seconds(2)), line(seconds(5)), line(seconds(9))]
    const metrics = measure({ lines, endStep: seconds(12) })
    expect(metrics.maxGapRealSeconds).toBe(4)
  })

  it('첫 줄 전 공백과 마지막 줄 뒤 공백도 센다', () => {
    expect(measure({ lines: [line(seconds(6))], endStep: seconds(8) }).maxGapRealSeconds).toBe(6)
    expect(measure({ lines: [line(seconds(1))], endStep: seconds(8) }).maxGapRealSeconds).toBe(7)
  })

  it('묶인 줄은 처음 스텝의 1줄로 센다', () => {
    const lines = [line(seconds(1), 'silence', 5), line(seconds(3))]
    const metrics = measure({ lines, endStep: seconds(4) })
    expect(metrics.lineCount).toBe(2)
    expect(metrics.silenceLineRatio).toBe(0.5)
  })

  it('묶인 줄의 공백은 처음 스텝부터 잰다(뒤 반복이 공백을 메우지 않는다)', () => {
    // 1초에 처음 찍히고 이후 몇 번 묶였더라도 줄의 step은 1초다. 다음 줄(7초)까지 6초 공백으로 본다
    const lines = [line(seconds(1), 'habit', 4), line(seconds(7))]
    expect(measure({ lines, endStep: seconds(8) }).maxGapRealSeconds).toBe(6)
  })

  it('정적 줄 비율은 silence 줄 수 / 전체 줄 수다', () => {
    const lines = [line(0, 'silence'), line(1), line(2, 'incident'), line(3, 'stage'), line(4, 'staff')]
    expect(measure({ lines, endStep: 5 }).silenceLineRatio).toBe(0.2)
  })

  it('줄이 없으면 정적 줄 비율은 0이고 공백은 방송 전체다', () => {
    const metrics = measure({ endStep: seconds(10) })
    expect(metrics.silenceLineRatio).toBe(0)
    expect(metrics.maxGapRealSeconds).toBe(10)
    expect(metrics.lineCount).toBe(0)
  })

  it('큰 터짐·작은 터짐 수, 출연자당 큰 터짐 최대, 경고 지연(몸 초)을 센다', () => {
    const records = [
      burst(seconds(20), 'rex', 'big', seconds(9)),
      burst(seconds(40), 'priya', 'big', seconds(30)),
      burst(seconds(90), 'rex', 'big', seconds(80)),
      burst(seconds(5), 'mo', 'small'),
      burst(seconds(6), 'mo', 'small', seconds(1)),
    ]
    const metrics = measure({ bursts: records, endStep: seconds(100) })
    expect(metrics.bigBursts).toBe(3)
    expect(metrics.maxBigBurstsPerActor).toBe(2)
    expect(metrics.smallBursts).toBe(2)
    expect(metrics.warningDelaysBodySeconds).toEqual([11, 10, 10])
  })

  it('큰 터짐이 없으면 출연자당 최대는 0이다', () => {
    expect(measure({ endStep: 1 }).maxBigBurstsPerActor).toBe(0)
  })

  it('2단계 진입 스텝이 없는 큰 터짐은 기록 오류로 throw한다', () => {
    expect(() => measure({ bursts: [burst(10, 'rex', 'big')], endStep: 20 })).toThrow()
  })

  it('중단 여부와 최대 연쇄 깊이를 그대로 옮긴다', () => {
    const metrics = measure({ summary: summary(4), halted: true, endStep: 10 })
    expect(metrics.halted).toBe(true)
    expect(metrics.maxChainDepth).toBe(4)
  })
})

describe('measureBroadcast 렉스 주목 욕구', () => {
  it('렉스 주목 욕구가 1단계에 닿은 기록이 있으면 true다', () => {
    const stages = [stage(seconds(30), 'rex', 'attention', 1)]
    expect(measure({ stages, endStep: seconds(60) }).rexAttentionReached).toBe(true)
  })

  it('한 번에 2단계로 올라간 기록도 1단계에 닿은 것으로 친다', () => {
    const stages = [stage(seconds(30), 'rex', 'attention', 2)]
    expect(measure({ stages, endStep: seconds(60) }).rexAttentionReached).toBe(true)
  })

  it('다른 감정이나 다른 출연자의 주목 욕구 기록만 있으면 false다', () => {
    const stages = [stage(seconds(10), 'rex', 'irritation', 2), stage(seconds(20), 'priya', 'attention', 1)]
    expect(measure({ stages, endStep: seconds(60) }).rexAttentionReached).toBe(false)
  })

  it('렉스가 없는 방송이면 null이다', () => {
    const stages = [stage(seconds(30), 'rex', 'attention', 1)]
    expect(measure({ stages, rexId: null, endStep: seconds(60) }).rexAttentionReached).toBeNull()
  })
})

describe('evaluateGates', () => {
  it('게이트 9개를 정해진 이름으로 낸다', () => {
    expect(evaluateGates([passing()]).map((result) => result.name)).toEqual([
      '로그 공백',
      '정적 줄',
      '큰 터짐 수',
      '출연자당 큰 터짐',
      '작은 터짐 수',
      '중단',
      '연쇄 깊이',
      '경고 창',
      '렉스 주목 욕구',
    ])
    // 렉스 게이트는 판 비율이라 두 판 중 한 판(50%)이 닿게 둔다
    const runs = [passing({ rexAttentionReached: true }), passing({ rexAttentionReached: false })]
    expect(evaluateGates(runs).every((result) => result.pass)).toBe(true)
  })

  it('로그 공백: 정확히 5초는 통과, 한 시드라도 넘으면 실패', () => {
    expect(gate(runsWith(50, { maxGapRealSeconds: 5 }), '로그 공백').pass).toBe(true)
    expect(gate(runsWith(1, { maxGapRealSeconds: 5.02 }), '로그 공백').pass).toBe(false)
  })

  it.each([
    { name: '정적 줄', bad: { silenceLineRatio: 0.21 }, edge: { silenceLineRatio: 0.2 } },
    { name: '큰 터짐 수', bad: { bigBursts: 0 }, edge: { bigBursts: 3 } },
    { name: '큰 터짐 수', bad: { bigBursts: 4 }, edge: { bigBursts: 1 } },
    { name: '출연자당 큰 터짐', bad: { maxBigBurstsPerActor: 2 }, edge: { maxBigBurstsPerActor: 0 } },
    { name: '작은 터짐 수', bad: { smallBursts: 3 }, edge: { smallBursts: 4 } },
    { name: '작은 터짐 수', bad: { smallBursts: 9 }, edge: { smallBursts: 8 } },
  ])('$name: 시드 80%가 범위 안이면 통과, 78%면 실패(L6)', ({ name, bad, edge }) => {
    expect(gate(runsWith(50, edge), name).pass).toBe(true)
    expect(gate(runsWith(10, bad), name).pass).toBe(true)
    expect(gate(runsWith(11, bad), name).pass).toBe(false)
  })

  it('중단: 10%까지 통과, 넘으면 실패', () => {
    expect(gate(runsWith(5, { halted: true }), '중단').pass).toBe(true)
    expect(gate(runsWith(6, { halted: true }), '중단').pass).toBe(false)
  })

  it('연쇄 깊이: 시드 90%가 3 이하면 통과, 88%면 실패', () => {
    expect(gate(runsWith(50, { maxChainDepth: 3 }), '연쇄 깊이').pass).toBe(true)
    expect(gate(runsWith(5, { maxChainDepth: 4 }), '연쇄 깊이').pass).toBe(true)
    expect(gate(runsWith(6, { maxChainDepth: 4 }), '연쇄 깊이').pass).toBe(false)
  })

  it('경고 창: 모든 지연이 3초 이상이고 평균이 8초 이상이어야 통과', () => {
    expect(gate([passing({ warningDelaysBodySeconds: [3, 13] })], '경고 창').pass).toBe(true)
    expect(gate([passing({ warningDelaysBodySeconds: [2.9, 20] })], '경고 창').pass).toBe(false)
    expect(gate([passing({ warningDelaysBodySeconds: [7, 8.9] })], '경고 창').pass).toBe(false)
    // 평균은 시드마다가 아니라 전체 지연으로 낸다
    const runs = [passing({ warningDelaysBodySeconds: [4] }), passing({ warningDelaysBodySeconds: [12, 12] })]
    expect(gate(runs, '경고 창').pass).toBe(true)
  })

  it('경고 창: 큰 터짐이 한 번도 없으면 평균을 낼 수 없어 실패', () => {
    expect(gate([passing({ warningDelaysBodySeconds: [] })], '경고 창').pass).toBe(false)
  })

  /** 50판 중 reached판만 렉스 주목 욕구가 1단계에 닿는다 */
  function rexRuns(reached: number, absent = 0) {
    return Array.from({ length: 50 }, (_, index) =>
      passing({ rexAttentionReached: index < absent ? null : index < absent + reached }),
    )
  }

  it('렉스 주목 욕구: 도달 비율 40~60%면 통과, 밖이면 실패', () => {
    expect(gate(rexRuns(20), '렉스 주목 욕구').pass).toBe(true)
    expect(gate(rexRuns(30), '렉스 주목 욕구').pass).toBe(true)
    expect(gate(rexRuns(19), '렉스 주목 욕구').pass).toBe(false)
    expect(gate(rexRuns(31), '렉스 주목 욕구').pass).toBe(false)
  })

  it('렉스 주목 욕구: 렉스가 없는(null) 판은 분모에서 빠진다', () => {
    // 렉스가 있는 30판 중 12판 = 40%: 통과. null 20판을 분모에 넣으면 24%로 실패했을 것이다
    const runs = rexRuns(12, 20)
    expect(gate(runs, '렉스 주목 욕구').pass).toBe(true)
    expect(gate(runs, '렉스 주목 욕구').detail).toContain('12/30')
    // 렉스가 있는 30판 중 11판 = 36.7%: 실패
    expect(gate(rexRuns(11, 20), '렉스 주목 욕구').pass).toBe(false)
  })

  it('렉스 주목 욕구: 렉스가 있는 판이 하나도 없으면 실패', () => {
    expect(gate(rexRuns(0, 50), '렉스 주목 욕구').pass).toBe(false)
  })

  it('detail에 통과 시드 수를 적는다', () => {
    expect(gate(runsWith(11, { bigBursts: 0 }), '큰 터짐 수').detail).toContain('39/50')
  })
})

describe('결정론', () => {
  async function measureNoInput(seed: number): Promise<BroadcastMetrics> {
    const broadcast = await Broadcast.create({ show: TALK_SHOW, ...LINEUP, seed })
    try {
      while (broadcast.phase === 'live') broadcast.step([])
      return measureFinishedBroadcast(broadcast, LINEUP.performers)
    } finally {
      broadcast.dispose()
    }
  }

  it('실제 라인업 시드 3 무입력 방송을 두 번 돌린 지표가 같다', async () => {
    const first = await measureNoInput(3)
    const second = await measureNoInput(3)
    expect(second).toEqual(first)
    expect(first.lineCount).toBeGreaterThan(0)
    // 실제 180초 방송 두 판이라 혼자는 약 4초, 전체 suite 병렬 실행에서는 7초 넘게 걸린다
  }, 30_000)
})
