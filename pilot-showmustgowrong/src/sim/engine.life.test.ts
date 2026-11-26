import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIFE_TICK_BODY_SECONDS, LOG_NUDGE_BODY_SECONDS, STEP_SECONDS } from '@/content/balance'
import { COMMON_EMOTION_DEFS } from '@/content/emotions'
import { TALK_SHOW } from '@/content/talkShow'
import type {
  BurstAction,
  BurstDef,
  DirectiveDef,
  HabitDef,
  MindDef,
  PerformerDef,
  ReactionDef,
  SensitivityDef,
} from '@/content/types'
import { describeRootEvent, withSubject } from './describe'
import {
  Broadcast,
  replay,
  type BroadcastInput,
  type BroadcastSetup,
  type LogLine,
} from './engine'
import { StudioLife } from './life'
import { isStir, type PhenomenonEvent } from './phenomena'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const seconds = (value: number) => Math.round(value * STEPS_PER_SECOND)

// ── fixture: 작은 mind(공용 감정 4개, 정적 → 지루함, 버릇 2개, 응답 버릇 1개) ──

const BORED_BY_SILENCE: SensitivityDef = {
  emotion: 'boredom',
  on: 'situation',
  situation: { kind: 'silence' },
  // 기준(6/분)의 10배라 정적이 시작되고 실제 약 8초 만에 1단계에 이른다
  perShowMinute: 60,
  label: { noun: '정적', clause: '긴 정적에 지친' },
}

const NOSE_PICK: HabitDef = {
  id: 'nosePick',
  line: '코를 판다',
  recall: '코를 파던',
  noun: '코 파기',
  pose: 'idle',
  stir: { kind: 'noise', target: 'none' },
  weight: 1,
}

const GIGGLE: HabitDef = {
  id: 'giggle',
  line: '혼자 킥킥댄다',
  targetLine: '{target:을} 보며 킥킥댄다',
  recall: '킥킥대던',
  noun: '킥킥거림',
  pose: 'laugh',
  stir: { kind: 'laughter', target: 'nearestPerformer' },
  weight: 1,
}

const GLARE: HabitDef = {
  id: 'glare',
  line: '눈을 흘긴다',
  targetLine: '{target:에게} 눈을 흘긴다',
  recall: '눈을 흘기던',
  noun: '눈 흘김',
  pose: 'angry',
  stir: { kind: 'anger', target: 'cause' },
  weight: 1,
  respondsTo: { kinds: ['laughter'], chance: 1 },
}

const SMALL_BURST: BurstAction = {
  line: '한숨을 쉰다',
  targetLine: '{target:에게} 투덜댄다',
  action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 1, target: 'nearestPerformer' }] },
}

const BIG_BURST: BurstAction = {
  line: '욕을 퍼붓는다',
  action: {
    pose: 'angry',
    emits: [
      { kind: 'anger', intensity: 3, target: 'none' },
      { kind: 'noise', intensity: 1, target: 'none' },
    ],
  },
}

/** 현상을 내지 않는 터짐(반사 반응 난수 테스트용) */
const QUIET_BURST: BurstAction = { line: '몸을 비튼다', action: { pose: 'idle', emits: [] } }

function burstsOf(burst: BurstDef): Record<string, BurstDef> {
  return Object.fromEntries(COMMON_EMOTION_DEFS.map((emotion) => [emotion.id, burst]))
}

function mind(overrides: Partial<MindDef> = {}): MindDef {
  return {
    emotions: [...COMMON_EMOTION_DEFS],
    sensitivities: [BORED_BY_SILENCE],
    bursts: burstsOf({ small: SMALL_BURST, big: BIG_BURST }),
    habits: [NOSE_PICK, GIGGLE, GLARE],
    ...overrides,
  }
}

const CALM: DirectiveDef = {
  id: 'calm',
  label: '진정',
  expect: '진정한다',
  action: { pose: 'idle', emits: [] },
}

function performer(
  id: string,
  shortName: string,
  overrides: Partial<PerformerDef> = {},
): PerformerDef {
  return {
    id,
    name: shortName,
    shortName,
    role: '역할',
    tendency: '성향',
    presence: 1,
    tolerance: 'max',
    weight: 'normal',
    tags: [],
    reactions: [],
    directives: [CALM],
    misfire: 'never',
    ...overrides,
  }
}

/** 욕설(분노 3)을 보면 소리를 낸다. 터짐 사건이 연쇄로 이어지는지 본다 */
const STARTLED_BY_SWEARING: ReactionDef = {
  trigger: { kind: 'anger', min: 3, scope: 'perceived' },
  action: { pose: 'panic', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
}

/** 지시로 가장 가까운 출연자에게 분노(강도 1)를 내보낸다. 확률 없이 분노 사건을 만든다 */
const SNAP: DirectiveDef = {
  id: 'snap',
  label: '다그쳐',
  expect: '화를 낸다',
  action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 1, target: 'nearestPerformer' }] },
}

/** mind 없이 지시로만 분노를 내는 렉스 */
const snapperRex = () => performer('rex', '렉스', { tags: ['host'], directives: [SNAP] })

const REX = performer('rex', '렉스', { tags: ['host'], mind: mind() })
const MO = performer('mo', '모', { tags: ['guest'], mind: mind() })
/** mind 없는 출연자 */
const PRIYA = performer('priya', '프리야', { tags: ['guest'], reactions: [STARTLED_BY_SWEARING] })

const setup = (overrides: Partial<BroadcastSetup> = {}): BroadcastSetup => ({
  show: TALK_SHOW,
  performers: [REX, MO, PRIYA],
  bench: [],
  staff: [],
  equipment: [],
  seed: 1,
  ...overrides,
})

// ── 실행 도우미 ──

const opened: Broadcast[] = []

async function open(broadcastSetup: BroadcastSetup): Promise<Broadcast> {
  const broadcast = await Broadcast.create(broadcastSetup)
  opened.push(broadcast)
  return broadcast
}

afterEach(() => {
  for (const broadcast of opened.splice(0)) broadcast.dispose()
})

/** view.log는 최근 줄만 담으므로 줄 번호로 모은다(묶여서 repeat가 오른 줄은 새 값으로 덮는다) */
class LineRecorder {
  private readonly byIndex = new Map<number, LogLine>()

  record(broadcast: Broadcast): void {
    for (const line of broadcast.view().log) this.byIndex.set(line.index, line)
  }

  get lines(): LogLine[] {
    return [...this.byIndex.values()].sort((a, b) => a.index - b.index)
  }
}

/** 기록 간격. view.log가 담는 줄 수보다 이 간격에 생기는 줄이 훨씬 적다 */
const RECORD_EVERY = 30

/** steps 스텝을 돈다. 광고 입력 스텝 뒤에는 바로 재개한다 */
function run(
  broadcast: Broadcast,
  steps: number,
  recorder?: LineRecorder,
  inputs: ReadonlyMap<number, BroadcastInput[]> = new Map(),
): void {
  const target = broadcast.currentStep + steps
  while (broadcast.currentStep < target && broadcast.phase !== 'ended') {
    broadcast.step(inputs.get(broadcast.currentStep) ?? [])
    if (broadcast.phase === 'adBreak') broadcast.resumeFromAd()
    if (recorder && broadcast.currentStep % RECORD_EVERY === 0) recorder.record(broadcast)
  }
  recorder?.record(broadcast)
}

/** 조건에 맞는 사건이 생길 때까지 돈다 */
function runUntilEvent(
  broadcast: Broadcast,
  maxSteps: number,
  match: (event: PhenomenonEvent) => boolean,
  recorder?: LineRecorder,
): PhenomenonEvent {
  for (let i = 0; i < maxSteps; i++) {
    broadcast.step([])
    if (recorder && broadcast.currentStep % RECORD_EVERY === 0) recorder.record(broadcast)
    const found = broadcast.events().find(match)
    if (found !== undefined) {
      recorder?.record(broadcast)
      return found
    }
  }
  throw new Error(`${maxSteps} 스텝 안에 기대한 사건이 생기지 않았습니다.`)
}

/**
 * 확률로 일어나는 일(터짐 판정 등)을 기다리는 상한. 몇 초 안에 일어나는지는 시드가 정하므로,
 * 테스트는 "언젠가 일어난 뒤" 그 일의 규칙만 본다. 상한은 일어날 확률이 사실상 1인 길이다.
 */
const WAIT_LIMIT_STEPS = seconds(600)

/** 조건에 맞는 줄이 생길 때까지 돈다 */
function runUntilLine(
  broadcast: Broadcast,
  maxSteps: number,
  recorder: LineRecorder,
  match: (line: LogLine) => boolean,
): LogLine {
  for (let spent = 0; spent < maxSteps; spent += RECORD_EVERY) {
    run(broadcast, RECORD_EVERY, recorder)
    const found = recorder.lines.find(match)
    if (found !== undefined) return found
  }
  throw new Error(`${maxSteps} 스텝 안에 기대한 줄이 생기지 않았습니다.`)
}

const byKind = (lines: readonly LogLine[], kind: LogLine['kind']) =>
  lines.filter((line) => line.kind === kind)

const stirsOf = (broadcast: Broadcast) => broadcast.events().filter(isStir)

describe('생활 연결: 버릇 줄', () => {
  it('무입력 60초 동안 mind가 있는 출연자마다 버릇 줄(kind habit)이 남는다', async () => {
    const broadcast = await open(setup())
    const recorder = new LineRecorder()
    run(broadcast, seconds(60), recorder)

    const habits = byKind(recorder.lines, 'habit')
    for (const name of ['렉스', '모']) {
      expect(habits.some((line) => line.text.includes(`${withSubject(name)} `))).toBe(true)
    }
    expect(habits.every((line) => line.emotion === null)).toBe(true)
  })

  it('버릇 줄은 한 줄이고 기척 사건의 eventId를 가지며, 기척은 따로 줄을 찍지 않는다', async () => {
    const broadcast = await open(setup())
    const recorder = new LineRecorder()
    run(broadcast, seconds(60), recorder)

    const stirIds = new Set(stirsOf(broadcast).map((event) => event.id))
    expect(stirIds.size).toBeGreaterThan(0)
    // 정산의 사건 수는 기척을 세지 않는다
    expect(broadcast.summary().eventCount).toBe(
      broadcast.events().filter((event) => !isStir(event)).length,
    )
    const linesWithStir = recorder.lines.filter(
      (line) => line.eventId !== null && stirIds.has(line.eventId),
    )
    // 기척을 가리키는 줄은 모두 버릇 줄이고, 기척 하나에 줄은 많아야 하나다
    expect(linesWithStir.length).toBeGreaterThan(0)
    expect(linesWithStir.every((line) => line.kind === 'habit')).toBe(true)
    const ids = linesWithStir.map((line) => line.eventId)
    expect(new Set(ids).size).toBe(ids.length)
    // 버릇 줄의 깊이는 기척 깊이다
    for (const line of linesWithStir) {
      const stir = broadcast.events().find((event) => event.id === line.eventId)
      expect(line.depth).toBe(stir?.depth)
    }
  })

  it('소리 나는 기척은 방송 정적을 메우지만, 출연자는 밋밋함에 계속 지루해지고 점수·게이지는 그대로다', async () => {
    const living = await open(setup())
    const plain = await open(
      setup({ performers: [REX, MO, PRIYA].map((def) => ({ ...def, mind: undefined })) }),
    )
    const until = seconds(8)
    run(living, until)
    run(plain, until)

    // 정적 1단계(실제 5초) 전에 소리 나는 기척이 났다. 재촉(L2)이 실제 4초 안에 버릇을 보장하고,
    // fixture 버릇(코 파기·킥킥대기)은 모두 소리 나는 기척이라 시드에 기대지 않는다
    const silenceStep = seconds(5) - 1
    expect(stirsOf(living).some((event) => event.step < silenceStep)).toBe(true)
    expect(stirsOf(plain)).toEqual([])
    const firstSilence = (broadcast: Broadcast) =>
      broadcast.events().find((event) => event.kind === 'silence')?.step ?? Number.POSITIVE_INFINITY
    // 기척 없는 방송은 실제 5초에 정적 1단계, 기척 있는 방송은 그보다 늦다(버릇 소리가 정적을 메웠다)
    expect(firstSilence(plain)).toBe(silenceStep)
    expect(firstSilence(living)).toBeGreaterThan(silenceStep)
    // 그래도 눈에 띄는 일은 없었으므로 지루함은 쌓인다(감정의 silence 상황 = 밋밋함)
    const boredom = living.view().actors.find((actor) => actor.id === 'rex')?.emotions.find((e) => e.id === 'boredom')
    expect(boredom?.value ?? 0).toBeGreaterThan(0)
    // 기척 자체는 점수를 내지 않는다. 정적 손실이 줄어 시청자는 같거나 많다
    expect(living.view().gauges).toEqual(plain.view().gauges)
    expect(living.view().viewers).toBeGreaterThanOrEqual(plain.view().viewers)
    expect(living.view().recentPhenomena).toEqual([])
  })

  it('소리 없는 기척(민망함)은 방송 정적을 메우지 않는다', async () => {
    const silentStir: HabitDef = { ...NOSE_PICK, id: 'silentPick', stir: { kind: 'exposure', target: 'none' } }
    const quietMind = mind({ habits: [silentStir] })
    const quiet = await open(
      setup({ performers: [REX, MO, PRIYA].map((def) => ({ ...def, mind: quietMind })) }),
    )
    const plain = await open(
      setup({ performers: [REX, MO, PRIYA].map((def) => ({ ...def, mind: undefined })) }),
    )
    run(quiet, seconds(8))
    run(plain, seconds(8))
    expect(stirsOf(quiet).some((event) => event.kind === 'exposure')).toBe(true)
    const silences = (broadcast: Broadcast) =>
      broadcast
        .events()
        .filter((event) => event.kind === 'silence')
        .map(({ step, intensity }) => ({ step, intensity }))
    expect(silences(quiet)).toEqual(silences(plain))
  })

  it('응답 버릇 줄은 "<이름>의 <명사>에 <이름>이 …" 꼴이고 원인 연결이 이어진다', async () => {
    const broadcast = await open(setup())
    const recorder = new LineRecorder()

    // 킥킥대기가 언제 나오는지는 시드가 정하므로, 응답 줄이 나올 때까지 기다린 뒤 줄의 꼴만 본다
    const pattern = /^(렉스|모)의 킥킥거림에 (렉스|모)[이가] (렉스|모)에게 눈을 흘긴다$/
    const response = runUntilLine(broadcast, WAIT_LIMIT_STEPS, recorder, (line) =>
      pattern.test(line.text),
    )
    if (response.eventId === null) throw new Error('응답 줄에 기척 사건이 없습니다')
    const [, giver, responder, target] = pattern.exec(response.text) ?? []
    expect(giver).toBe(target)
    expect(responder).not.toBe(giver)

    const events = broadcast.events()
    const glare = events.find((event) => event.id === response.eventId)
    const giggle = events.find((event) => event.id === glare?.causeId)
    expect(glare).toMatchObject({ kind: 'anger', intensity: 0, label: '눈 흘김' })
    expect(giggle).toMatchObject({ kind: 'laughter', intensity: 0, label: '킥킥거림' })
    expect(response.kind).toBe('habit')
    expect(response.depth).toBe(0)
  })
})

describe('생활 연결: 단계와 터짐', () => {
  it('지루함이 2단계에 이르면 stage 줄이 남고, 큰 터짐은 incident 줄 하나에 첫 사건 id를 가진다', async () => {
    const broadcast = await open(setup())
    const recorder = new LineRecorder()
    // 큰 터짐이 언제 나오는지는 시드가 정하므로, 나올 때까지 기다린 뒤 줄의 꼴만 본다
    runUntilLine(broadcast, WAIT_LIMIT_STEPS, recorder, (line) => line.text.endsWith('욕을 퍼붓는다'))

    const stage2 = byKind(recorder.lines, 'stage').find((line) => line.text.endsWith('딴짓 직전이다'))
    expect(stage2).toMatchObject({ kind: 'stage', emotion: 'boredom', depth: 1, eventId: null })

    const big = broadcast.burstRecords().find((record) => record.size === 'big')
    expect(big).toBeDefined()
    if (big === undefined) throw new Error('큰 터짐이 없습니다')
    const burstEvents = broadcast
      .events()
      .filter(
        (event) => event.step === big.step && event.sourceId === big.actorId && !isStir(event),
      )
    expect(burstEvents.map((event) => event.kind)).toEqual(['anger', 'noise'])
    const burstIds = new Set(burstEvents.map((event) => event.id))
    const burstLines = recorder.lines.filter(
      (line) => line.eventId !== null && burstIds.has(line.eventId),
    )
    expect(burstLines).toHaveLength(1)
    expect(burstLines[0]).toMatchObject({
      kind: 'incident',
      emotion: big.emotion,
      eventId: burstEvents[0].id,
      depth: burstEvents[0].depth,
    })
    expect(burstLines[0].text).toMatch(/욕을 퍼붓는다$/)
  })

  it('터짐 줄의 사건은 점수와 연쇄에 들어간다', async () => {
    const firstBig = async () => {
      // 큰 터짐이 언제 나오는지는 시드가 정하므로, 나올 때까지 돌려 그 스텝을 얻는다
      const broadcast = await open(setup())
      for (let spent = 0; spent < WAIT_LIMIT_STEPS; spent += RECORD_EVERY) {
        run(broadcast, RECORD_EVERY)
        const big = broadcast.burstRecords().find((record) => record.size === 'big')
        if (big !== undefined) return big
      }
      throw new Error('큰 터짐이 없습니다')
    }
    const big = await firstBig()

    const broadcast = await open(setup())
    run(broadcast, big.step)
    const before = broadcast.view().gauges.language
    broadcast.step([])
    // 욕설(분노 3)이 송출되어 언어 게이지가 오른다
    expect(broadcast.view().gauges.language).toBeGreaterThan(before)

    const swearing = broadcast
      .events()
      .find(
        (event) =>
          event.step === big.step && event.sourceId === big.actorId && event.kind === 'anger',
      )
    expect(swearing).toBeDefined()
    // 프리야가 다음 스텝에 욕설에 반응해 연쇄가 이어진다
    broadcast.step([])
    const reaction = broadcast
      .events()
      .find((event) => event.sourceId === 'priya' && event.causeId === swearing?.id)
    expect(reaction).toMatchObject({ kind: 'noise', depth: (swearing?.depth ?? 0) + 1 })
    expect(broadcast.summary().maxChainDepth).toBeGreaterThanOrEqual(2)
  })
})

describe('로그 묶기', () => {
  it('같은 문장이라도 줄 종류가 다르면 묶지 않는다', async () => {
    // 코너 반응의 행동 줄(incident)과 버릇 줄(habit)이 같은 문장으로 연달아 나온다
    const pickNoseOnCue: ReactionDef = {
      trigger: { kind: 'corner', tag: 'host' },
      action: { pose: 'idle', emits: [], line: '렉스가 코를 판다' },
    }
    const rex = performer('rex', '렉스', {
      tags: ['host'],
      reactions: [pickNoseOnCue],
      mind: mind({ sensitivities: [], habits: [NOSE_PICK] }),
    })
    const broadcast = await open(setup({ performers: [rex] }))
    const recorder = new LineRecorder()
    run(broadcast, seconds(5) - 2, recorder)

    expect(recorder.lines.map(({ text, kind, repeat }) => ({ text, kind, repeat }))).toEqual([
      { text: '렉스가 코를 판다', kind: 'incident', repeat: 1 },
      { text: '렉스가 코를 판다', kind: 'habit', repeat: 1 },
    ])
  })

  it('같은 줄이 묶이는 동안에도 첫 줄로부터 재촉 시간이 지나면 재촉한다(Ruling 14, Ruling 8 대체)', async () => {
    // 관객 소음 줄이 3초마다 묶인다. 묶여 repeat만 오른 것은 새 줄이 아니므로(spec 5.2-4 "묶인 줄은 1줄"),
    // 버릇 시계(실제 10초 이상)보다 먼저 첫 소음 줄로부터 재촉 시간(+틱) 뒤에 버릇이 온다
    const broadcast = await open(setup({ performers: [REX] }))
    const inputs = new Map([[0, [{ type: 'switch', cameraId: 'audienceCam' } as BroadcastInput]]])
    const recorder = new LineRecorder()
    run(broadcast, seconds(25), recorder, inputs)

    const [first, ...rest] = recorder.lines
    expect(first).toMatchObject({ text: '관객 쪽에서 소리가 난다' })
    expect(first.repeat).toBeGreaterThanOrEqual(2)
    const firstStir = stirsOf(broadcast)[0]
    expect(firstStir).toBeDefined()
    expect(firstStir.step).toBeGreaterThanOrEqual(first.step + seconds(LOG_NUDGE_BODY_SECONDS))
    expect(firstStir.step).toBeLessThanOrEqual(
      first.step + seconds(LOG_NUDGE_BODY_SECONDS + LIFE_TICK_BODY_SECONDS),
    )
    expect(firstStir.step).toBeLessThan(seconds(10))
    expect(rest[0]).toMatchObject({ kind: 'habit', eventId: firstStir.id })
  })

  it('같은 문장이 연달아 나오면 한 줄로 묶이고 repeat가 오른다', async () => {
    const broadcast = await open(
      setup({ performers: [performer('rex', '렉스'), performer('mo', '모')] }),
    )
    // 관객석을 송출하면 3초마다 관객이 같은 소음을 낸다(사이에 다른 줄이 없다)
    const inputs = new Map([[0, [{ type: 'switch', cameraId: 'audienceCam' } as BroadcastInput]]])
    const recorder = new LineRecorder()
    run(broadcast, seconds(20), recorder, inputs)

    const noises = broadcast
      .events()
      .filter((event) => event.sourceId === 'audience' && event.kind === 'noise')
    expect(noises.length).toBeGreaterThanOrEqual(3)
    expect(recorder.lines).toEqual([
      expect.objectContaining({
        index: 0,
        text: '관객 쪽에서 소리가 난다',
        kind: 'incident',
        step: noises[0].step,
        eventId: noises[0].id,
        lastEventId: noises.at(-1)?.id,
        repeat: noises.length,
      }),
    ])
  })
})

describe('광고와 생활', () => {
  it('재정비 광고 뒤 mind가 있는 출연자의 mood는 모두 0단계다', async () => {
    // 재정비: 지루함이 쌓인 뒤 reset 광고를 받으면 모두 0단계로 돌아간다
    const reset = await open(setup())
    const moodsOf = (broadcast: Broadcast) =>
      broadcast
        .view()
        .actors.filter((actor) => actor.mood !== null)
        .map((actor) => actor.mood)
    // 큰 터짐이 쌓임을 지우기도 하므로, 어느 출연자든 1단계 이상이 된 순간에 광고를 받는다
    while (!moodsOf(reset).some((mood) => (mood?.stage ?? 0) > 0)) {
      if (reset.currentStep >= seconds(60)) throw new Error('60초 안에 지루함이 쌓이지 않았습니다.')
      reset.step([])
    }
    reset.step([{ type: 'ad', effects: ['reset', 'relief'] }])
    reset.resumeFromAd()
    expect(moodsOf(reset)).toHaveLength(2)
    for (const mood of moodsOf(reset)) expect(mood).toMatchObject({ stage: 0, value: 0 })
  })
})

describe('광고 경계와 줄 깊이(Ruling 9)', () => {
  it('광고 전 사건에 광고 뒤 응답한 기척 없는 버릇 줄의 깊이는 0이다', async () => {
    // 모는 자기를 겨눈 분노(렉스의 지시, 깊이 1 이상)에 기척 없이 토라진다
    const sulk: HabitDef = {
      id: 'sulk',
      line: '토라진다',
      recall: '토라졌던',
      noun: '토라짐',
      pose: 'idle',
      weight: 1,
      respondsTo: { kinds: ['anger'], chance: 1 },
    }
    const mo = performer('mo', '모', {
      tags: ['guest'],
      mind: mind({ habits: [NOSE_PICK, sulk] }),
    })
    // 분노는 지시로 직접 만든다(렉스 → 모, 깊이 1). 그래야 시드가 분노 시점을 정하지 않는다
    const broadcast = await open(
      setup({ performers: [snapperRex(), mo], bench: [performer('june', '준')] }),
    )
    const recorder = new LineRecorder()
    // 출연자는 방송 시작 직후 잠깐 쉬므로(버릇 휴지) 응답할 수 있을 때까지 3초를 보낸다
    run(broadcast, seconds(3), recorder)
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'snap' }])
    // 모가 인지하기 전에 재정비 없는 광고를 받는다(인지와 응답은 광고 뒤)
    const adStep = broadcast.currentStep
    broadcast.step([{ type: 'ad', effects: ['relief', 'setup'] }])
    broadcast.resumeFromAd()
    const anger = broadcast
      .events()
      .find((event) => event.kind === 'anger' && event.intensity === 1 && event.targetId === 'mo')
    expect(anger?.depth).toBeGreaterThanOrEqual(1)
    run(broadcast, seconds(2), recorder)

    const sulkLine = recorder.lines.find(
      (line) => line.step >= adStep && line.text === '렉스의 화에 모가 토라진다',
    )
    expect(sulkLine).toMatchObject({ kind: 'habit', eventId: null, depth: 0 })
    // 그 사이 광고 뒤의 분노가 모를 겨누지 않았다(응답의 원인은 광고 전 분노다)
    const newAnger = broadcast
      .events()
      .filter((event) => event.step > adStep && event.kind === 'anger' && event.targetId === 'mo')
    expect(newAnger.filter((event) => event.step < (sulkLine?.step ?? 0))).toEqual([])
  })
})

// 현상 없는 터짐 줄의 깊이(광고 경계, Ruling 9)는 확률에 기대지 않도록 lifeActions.test.ts에서 터짐 출력을 직접 넣어 본다.

describe('이탈과 mind 없는 출연자', () => {
  it('이탈한 출연자를 겨눈 응답은 대상 없이 실행되고, 그 뒤 이탈자를 겨누는 사건과 줄이 없다', async () => {
    // 렉스는 킥킥대기 버릇만 가져 첫 버릇이 곧 모를 겨눈 킥킥대기다. 모는 버릇 시계로는 아무것도 하지 않고
    // 응답(눈 흘김)만 해서 쉬거나 쿨다운에 걸리지 않으므로, 응답이 시드에 기대지 않고 일어난다(감정 터짐도 없다)
    const idleClock: HabitDef = { ...NOSE_PICK, when: [{ kind: 'showTrait', trait: 'never' }] }
    const lowRex: PerformerDef = {
      ...REX,
      tolerance: 'low',
      mind: mind({ sensitivities: [], habits: [GIGGLE] }),
    }
    const glarer: PerformerDef = {
      ...MO,
      mind: mind({ sensitivities: [], habits: [idleClock, GLARE] }),
    }
    const broadcast = await open(setup({ performers: [lowRex, glarer] }))
    const recorder = new LineRecorder()
    // 렉스가 모를 보며 킥킥댄 직후 이탈시켜, 모가 응답할 대상(렉스)이 사라지게 한다
    runUntilEvent(
      broadcast,
      seconds(30),
      (event) => event.sourceId === 'rex' && event.label === '킥킥거림' && event.targetId === 'mo',
      recorder,
    )
    const calm: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'calm' }
    const walkoutStep = broadcast.currentStep
    broadcast.step([calm, calm, calm])
    expect(() => run(broadcast, seconds(60), recorder)).not.toThrow()

    // 모의 응답은 일어나지만 대상 없이 line 문장을 쓰고, 응답 기척도 대상이 없다
    const response = recorder.lines.find(
      (line) => line.step > walkoutStep && /^렉스의 킥킥거림에 모가 /.test(line.text),
    )
    expect(response).toMatchObject({ kind: 'habit', text: '렉스의 킥킥거림에 모가 눈을 흘긴다' })
    const glare = broadcast.events().find((event) => event.id === response?.eventId)
    expect(glare).toMatchObject({ sourceId: 'mo', label: '눈 흘김', targetId: null })

    const after = broadcast.events().filter((event) => event.step > walkoutStep)
    expect(after.some((event) => event.targetId === 'rex')).toBe(false)
    const linesAfter = recorder.lines.filter((line) => line.step > walkoutStep)
    expect(linesAfter.some((line) => /렉스(에게|를|와|과) /.test(line.text))).toBe(false)
    const rex = broadcast.view().actors.find((actor) => actor.id === 'rex')
    expect(rex).toMatchObject({ walkedOut: true, mood: null, emotions: [] })
  })

  it('mind 없는 출연자는 mood가 null, emotions가 빈 배열이고 버릇 줄이 없다', async () => {
    const broadcast = await open(setup())
    const recorder = new LineRecorder()
    run(broadcast, seconds(60), recorder)

    const view = broadcast.view()
    expect(view.actors.find((actor) => actor.id === 'priya')).toMatchObject({
      mood: null,
      emotions: [],
    })
    const rex = view.actors.find((actor) => actor.id === 'rex')
    expect(rex?.mood).not.toBeNull()
    expect(rex?.emotions.map((emotion) => emotion.id)).toEqual(
      COMMON_EMOTION_DEFS.map((emotion) => emotion.id),
    )
    expect(stirsOf(broadcast).some((event) => event.sourceId === 'priya')).toBe(false)
    expect(
      byKind(recorder.lines, 'habit').some((line) => line.text.includes(withSubject('프리야'))),
    ).toBe(false)
  })
})

describe('지시의 감정 변화', () => {
  const VENT: DirectiveDef = {
    id: 'vent',
    label: '참아',
    expect: '짜증이 쌓인다',
    action: { pose: 'idle', emits: [] },
    moodShifts: [{ emotion: 'irritation', amount: 40 }],
  }
  const ventLine = (name: string) => new RegExp(`^PD의 '참아'에 ${name}[이가] `)
  const irritationOf = (broadcast: Broadcast, actorId: string) =>
    broadcast
      .view()
      .actors.find((actor) => actor.id === actorId)
      ?.emotions?.find((emotion) => emotion.id === 'irritation')
  const withVent = (id: string, name: string, bursts: BurstDef) =>
    performer(id, name, {
      tags: [id === 'rex' ? 'host' : 'guest'],
      directives: [VENT],
      mind: mind({ sensitivities: [], bursts: burstsOf(bursts) }),
    })

  it('지시 뒤 그 출연자 감정에 지시 이유가 생기고 topReasons의 출처가 지시다', async () => {
    const broadcast = await open(setup({ performers: [withVent('rex', '렉스', { small: QUIET_BURST, big: QUIET_BURST }), MO] }))
    run(broadcast, 5)
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'vent' }])

    const rex = irritationOf(broadcast, 'rex')
    expect(rex?.reasons[0]).toMatchObject({
      emotion: 'irritation',
      source: { type: 'directive', label: '참아' },
    })
    expect(rex?.reasons[0].amount).toBeGreaterThan(0)
    // 지시받지 않은 출연자에게는 이유가 없다(L8)
    expect(irritationOf(broadcast, 'mo')?.reasons).toEqual([])
  })

  it('이탈 지시는 실행되지 않아 addDirective를 부르지 않고, 이탈 전 두 번만 부른다', async () => {
    const low = { ...withVent('rex', '렉스', { small: QUIET_BURST, big: QUIET_BURST }), tolerance: 'low' as const }
    const broadcast = await open(setup({ performers: [low, MO] }))
    const spy = vi.spyOn(StudioLife.prototype, 'addDirective')
    try {
      const direct: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'vent' }
      broadcast.step([direct])
      broadcast.step([direct])
      expect(spy).toHaveBeenCalledTimes(2)
      // 세 번째 지시는 이탈이다
      broadcast.step([direct])
      expect(broadcast.view().actors.find((actor) => actor.id === 'rex')?.walkedOut).toBe(true)
      expect(spy).toHaveBeenCalledTimes(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('지시 이유가 가장 큰 터짐 줄은 "PD의 \'<지시>\'에 <이름>이 …" 꼴이고 깊이 1이다', async () => {
    // 지시 한 번이 짜증을 문턱 위로 한참 유지하는 큰 지시다(터짐이 나올 시간을 번다)
    const strongVent: DirectiveDef = { ...VENT, moodShifts: [{ emotion: 'irritation', amount: 1000 }] }
    const rex = {
      ...withVent('rex', '렉스', { small: QUIET_BURST, big: QUIET_BURST }),
      directives: [strongVent],
    }
    const broadcast = await open(setup({ performers: [rex, MO] }))
    const recorder = new LineRecorder()
    const direct: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'vent' }
    // 터짐이 언제 나오는지는 시드가 정하고 이유는 시간이 지나면 옅어진다. 그래서 터짐 줄이 나올 때까지
    // 기다린 뒤 줄만 본다(옅어지도록 터짐이 없으면 다시 지시한다)
    const isBurstLine = (line: LogLine) =>
      line.emotion === 'irritation' && ventLine('렉스').test(line.text)
    let burstLine: LogLine | undefined
    for (let round = 0; round < 6 && burstLine === undefined; round++) {
      run(broadcast, seconds(10), recorder, new Map([[broadcast.currentStep, [direct]]]))
      burstLine = recorder.lines.find(isBurstLine)
    }
    if (burstLine === undefined) throw new Error('터짐 줄이 생기지 않았습니다.')
    expect(burstLine).toMatchObject({ kind: 'incident', eventId: null, depth: 1 })
  })

  it('감정 변화 지시와 엇나감이 섞인 방송을 replay하면 같은 결과다', async () => {
    const rex = {
      ...withVent('rex', '렉스', { small: SMALL_BURST, big: BIG_BURST }),
      misfire: 'overdo' as const,
    }
    const broadcastSetup = setup({ performers: [rex, MO] })
    const broadcast = await open(broadcastSetup)
    const direct: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'vent' }
    const inputs = new Map<number, BroadcastInput[]>(
      [100, 400, 700, 1000, 1300, 1600, 1900].map((step) => [step, [direct]]),
    )
    const steps = 3000
    run(broadcast, steps, undefined, inputs)
    const replayed = await replay(broadcastSetup, broadcast.inputLog(), steps)
    expect(replayed).toEqual(broadcast.view())
  })
})

describe('결정론', () => {
  it('mind가 섞인 방송을 입력 기록으로 replay하면 view가 같다', async () => {
    const broadcastSetup = setup({ bench: [performer('june', '준', { mind: mind() })] })
    const broadcast = await open(broadcastSetup)
    const inputs = new Map<number, BroadcastInput[]>([
      [30, [{ type: 'switch', cameraId: 'close' }]],
      [200, [{ type: 'direct', actorId: 'mo', directiveId: 'calm' }]],
      [1500, [{ type: 'ad', effects: ['reset', 'setup'] }]],
    ])
    const steps = 3600
    run(broadcast, steps, undefined, inputs)
    const replayed = await replay(broadcastSetup, broadcast.inputLog(), steps)
    expect(replayed).toEqual(broadcast.view())
  })

  it('재정비 없는 광고(relief·setup)와 이탈이 섞인 방송을 replay하면 view가 같다', async () => {
    const lowRex: PerformerDef = { ...REX, tolerance: 'low' }
    const broadcastSetup = setup({
      performers: [lowRex, MO, PRIYA],
      bench: [performer('june', '준', { tags: ['guest'], mind: mind() })],
    })
    const broadcast = await open(broadcastSetup)
    const calm: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'calm' }
    const inputs = new Map<number, BroadcastInput[]>([
      [30, [{ type: 'switch', cameraId: 'close' }]],
      [900, [{ type: 'ad', effects: ['relief', 'setup'] }]],
      // 광고 앞 사건에 대한 반응·감정이 남은 채로 렉스를 이탈시킨다
      [1500, [calm, calm, calm]],
    ])
    const steps = 3600
    run(broadcast, steps, undefined, inputs)
    const view = broadcast.view()
    expect(view.benchLeft).toBe(0)
    expect(view.actors.find((actor) => actor.id === 'rex')?.walkedOut).toBe(true)
    expect(view.actors.some((actor) => actor.id === 'june')).toBe(true)

    const replayed = await replay(broadcastSetup, broadcast.inputLog(), steps)
    expect(replayed).toEqual(view)
  })

  it('mind가 있어도 mind 없는 출연자의 반사 반응 난수 소비는 그대로다', async () => {
    // 렉스: mind 없음, 관객 소음에 확률 반응. 모: mind 있음/없음(현상을 내는 터짐이 없다)
    const flinch: ReactionDef = {
      trigger: { kind: 'noise', min: 1, scope: 'perceived' },
      chance: 0.5,
      action: { pose: 'panic', emits: [{ kind: 'exposure', intensity: 1, target: 'self' }] },
    }
    const rex = performer('rex', '렉스', { tags: ['host'], reactions: [flinch] })
    const quietMind = mind({ bursts: burstsOf({ small: QUIET_BURST, big: QUIET_BURST }) })
    const nearAudience = {
      ...TALK_SHOW,
      homeSpots: [
        { x: 3.5, z: 4 },
        { x: 6, z: 4 },
      ],
    }
    const reactionSteps = async (moMind: MindDef | undefined) => {
      const broadcast = await open(
        setup({
          show: nearAudience,
          performers: [rex, performer('mo', '모', { tags: ['guest'], mind: moMind })],
        }),
      )
      const inputs = new Map([[0, [{ type: 'switch', cameraId: 'audienceCam' } as BroadcastInput]]])
      run(broadcast, seconds(60), undefined, inputs)
      return {
        steps: broadcast
          .events()
          .filter((event) => event.sourceId === 'rex')
          .map((event) => event.step),
        moStirs: stirsOf(broadcast).filter((event) => event.sourceId === 'mo').length,
      }
    }
    const withMind = await reactionSteps(quietMind)
    const withoutMind = await reactionSteps(undefined)
    // 반응이 일부만 일어나야 난수를 실제로 쓴 것이다
    expect(withMind.steps.length).toBeGreaterThan(0)
    expect(withMind.moStirs).toBeGreaterThan(0)
    expect(withMind.steps).toEqual(withoutMind.steps)
  })
})

describe('정산 뿌리 줄', () => {
  it('summary.rootLine은 가장 깊은 연쇄를 버릇 기척까지 거슬러 올라간 줄이다', async () => {
    // 렉스가 모를 보며 킥킥대면(기척) 모의 흥분이 쌓여 웃음으로 터지고, 렉스가 그 웃음에 소리를 낸다
    const excitedByLaughter: SensitivityDef = {
      emotion: 'excitement',
      on: 'event',
      kind: 'laughter',
      scope: 'perceived',
      // 한 번 킥킥대는 것만으로 흥분이 오래 문턱 위에 머물러, 모의 터짐이 나올 시간이 넉넉하다
      amount: 1500,
    }
    const laughBurst: BurstAction = {
      line: '웃음을 참지 못한다',
      action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'none' }] },
    }
    const rex = performer('rex', '렉스', {
      tags: ['host'],
      mind: mind({ sensitivities: [], habits: [GIGGLE] }),
      reactions: [
        {
          trigger: { kind: 'laughter', min: 1, scope: 'perceived' },
          action: { pose: 'idle', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
        },
      ],
    })
    const mo = performer('mo', '모', {
      tags: ['guest'],
      mind: mind({
        sensitivities: [excitedByLaughter],
        habits: [NOSE_PICK],
        bursts: burstsOf({ small: laughBurst, big: laughBurst }),
      }),
    })
    const broadcast = await open(setup({ performers: [rex, mo] }))
    const recorder = new LineRecorder()
    // 모의 터짐이 언제 나오는지는 시드가 정하므로, 렉스가 그 웃음에 소리를 낼 때까지 기다린 뒤 정산을 본다
    runUntilEvent(
      broadcast,
      WAIT_LIMIT_STEPS,
      (event) => event.sourceId === 'rex' && event.kind === 'noise',
      recorder,
    )

    const summary = broadcast.summary()
    expect(summary.maxChainDepth).toBeGreaterThanOrEqual(2)
    const rootLine = recorder.lines.find(
      (line) => line.step === summary.rootLine?.step && line.text === summary.rootLine.text,
    )
    expect(rootLine).toMatchObject({ kind: 'habit', text: '렉스가 모를 보며 킥킥댄다' })
    const root = broadcast.events().find((event) => event.id === rootLine?.eventId)
    expect(root).toMatchObject({ sourceId: 'rex', intensity: 0, label: '킥킥거림' })
  })

  it('뿌리 기척의 버릇 줄이 앞 줄에 묶여 줄이 없으면 rootLine은 "<출처>의 <기척 명사>"다', async () => {
    // 렉스의 두 버릇은 문장이 같다. 화면 밖일 때만 하는 '낄낄'이 '킥킥' 바로 뒤에 오면 한 줄로 묶이고,
    // 모를 겨눈 '낄낄' 기척이 모의 흥분 터짐 → 렉스의 소리로 이어져 가장 깊은 연쇄의 뿌리가 된다.
    const giggleAlone: HabitDef = { ...GIGGLE, stir: { kind: 'laughter', target: 'none' } }
    const snickerAtMo: HabitDef = {
      id: 'snicker',
      line: GIGGLE.line,
      recall: '낄낄대던',
      noun: '낄낄거림',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'nearestPerformer' },
      weight: 1,
      when: [{ kind: 'offScreen' }],
    }
    const rex = performer('rex', '렉스', {
      tags: ['host'],
      mind: mind({ sensitivities: [], habits: [giggleAlone, snickerAtMo] }),
      reactions: [
        {
          trigger: { kind: 'laughter', min: 1, scope: 'perceived' },
          action: { pose: 'idle', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
        },
      ],
    })
    const laughBurst: BurstAction = {
      line: '웃음을 참지 못한다',
      action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'none' }] },
    }
    const mo = performer('mo', '모', {
      tags: ['guest'],
      mind: mind({
        // 자기를 겨눈 웃음에만 흥분한다(렉스의 '킥킥'은 대상이 없어 쌓이지 않는다)
        sensitivities: [
          {
            emotion: 'excitement',
            on: 'event',
            kind: 'laughter',
            scope: 'targetsSelf',
            amount: 1000,
          },
        ],
        // 버릇 시계로는 아무것도 하지 않는다
        habits: [{ ...NOSE_PICK, when: [{ kind: 'showTrait', trait: 'never' }] }],
        bursts: burstsOf({ small: laughBurst, big: laughBurst }),
      }),
    })
    const broadcast = await open(setup({ performers: [rex, mo] }))
    const recorder = new LineRecorder()
    // 두 번째 '킥킥'(버릇 쿨다운 뒤) 직후 클로즈업이 모를 잡게 해 렉스를 화면 밖으로 보낸다
    const firstGiggle = runUntilEvent(broadcast, seconds(10), (event) => event.label === '킥킥거림')
    runUntilEvent(
      broadcast,
      seconds(60),
      (event) => event.label === '킥킥거림' && event.id !== firstGiggle.id,
      recorder,
    )
    broadcast.step([
      { type: 'track', cameraId: 'close', actorId: 'mo' },
      { type: 'switch', cameraId: 'close' },
    ])
    run(broadcast, seconds(30), recorder)

    const snicker = broadcast.events().find((event) => event.label === '낄낄거림')
    expect(snicker).toMatchObject({ sourceId: 'rex', targetId: 'mo', intensity: 0 })
    if (snicker === undefined) throw new Error('낄낄 기척이 없습니다')
    expect(recorder.lines.some((line) => line.eventId === snicker.id)).toBe(false)
    const grouped = recorder.lines.find((line) => line.text === '렉스가 혼자 킥킥댄다' && line.repeat === 2)
    expect(grouped).toBeDefined()

    const summary = broadcast.summary()
    expect(summary.maxChainDepth).toBeGreaterThanOrEqual(2)
    expect(summary.rootLine).toEqual({ step: snicker.step, text: describeRootEvent(snicker, { rex: '렉스' }) })
    expect(summary.rootLine?.text).toBe('렉스의 낄낄거림')
  })
})
