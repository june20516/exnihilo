import { describe, expect, it } from 'vitest'
import {
  BIG_BURST_GRACE_BODY_SECONDS,
  BIG_BURST_MTB_BODY_SECONDS,
  HABIT_COOLDOWN_SHOW_SECONDS,
  LIFE_TICK_BODY_SECONDS,
  LOG_NUDGE_SHOW_SECONDS,
  RECALL_SHOW_SECONDS,
  RESPONSE_COOLDOWN_SHOW_SECONDS,
  SMALL_BURST_COOLDOWN_SHOW_SECONDS,
  SMALL_BURST_KEEP,
  STAGE_LINE_COOLDOWN_SHOW_SECONDS,
  STEP_SECONDS,
} from '@/content/balance'
import { COMMON_EMOTION_DEFS } from '@/content/emotions'
import { TALK_SHOW } from '@/content/talkShow'
import type {
  BurstDef,
  EventIntensity,
  HabitDef,
  MindDef,
  PerformerDef,
} from '@/content/types'
import {
  StudioLife,
  type LifeContext,
  type LifeMember,
  type LifeOutput,
} from './life'
import { Mind } from './emotion'
import { pickWeighted } from './habits'
import type { Perceiver, PhenomenonEvent } from './phenomena'
import { showSecondsToSteps } from './showClock'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const TICK_STEPS = Math.round(LIFE_TICK_BODY_SECONDS / STEP_SECONDS)
const GRACE_STEPS = Math.round(BIG_BURST_GRACE_BODY_SECONDS / STEP_SECONDS)
const REAL_SECONDS_STEPS = (realSeconds: number) => realSeconds * STEPS_PER_SECOND
const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1)

type BurstOutput = Extract<LifeOutput, { type: 'burst' }>
type HabitOutput = Extract<LifeOutput, { type: 'habit' }>
type StageOutput = Extract<LifeOutput, { type: 'stage' }>

interface Timed {
  step: number
  output: LifeOutput
}

const BURSTS: Record<string, BurstDef> = {
  irritation: {
    small: {
      line: '혀를 찬다',
      action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 1, target: 'self' }] },
    },
    big: {
      line: '소리를 지른다',
      intenseLine: '폭발한다',
      action: {
        pose: 'angry',
        emits: [
          { kind: 'anger', intensity: 2, target: 'self' },
          { kind: 'noise', intensity: 1, target: 'self' },
        ],
      },
    },
  },
}

function mindDef(overrides: Partial<MindDef> = {}): MindDef {
  return {
    emotions: [...COMMON_EMOTION_DEFS],
    sensitivities: [],
    bursts: {},
    habits: [],
    ...overrides,
  }
}

function performer(id: string, mind?: MindDef): PerformerDef {
  return {
    id,
    name: id,
    shortName: id,
    role: '테스트',
    tendency: '',
    presence: 1,
    tolerance: 'normal',
    weight: 'normal',
    tags: [],
    reactions: [],
    directives: [],
    misfire: 'never',
    mind,
  }
}

function habit(id: string, overrides: Partial<HabitDef> = {}): HabitDef {
  return {
    id,
    line: `${id}를 한다`,
    recall: `${id}를 하던`,
    noun: id,
    pose: 'idle',
    weight: 1,
    ...overrides,
  }
}

function member(id: string, overrides: Partial<LifeMember> = {}): LifeMember {
  return { id, x: 0, y: 0, z: 0, onAir: true, resting: false, nearTags: [], ...overrides }
}

function perceiver(id: string): Perceiver {
  return { id, x: 0, y: 0, z: 0, inDarkness: false }
}

function makeEvent(overrides: Partial<PhenomenonEvent> = {}): PhenomenonEvent {
  return {
    id: 1,
    kind: 'noise',
    intensity: 3 as EventIntensity,
    sourceId: 'b',
    targetId: null,
    x: 1,
    y: 0,
    z: 0,
    step: 0,
    causeId: null,
    depth: 1,
    ...overrides,
  }
}

function makeLife(seed: number, defs: readonly PerformerDef[], step = 0): StudioLife {
  const life = new StudioLife(TALK_SHOW, seed)
  for (const def of defs) life.join(def, step)
  return life
}

interface RunOptions {
  /** true면 줄이 한 번도 없었던 것처럼 재촉이 켜진다. false면 재촉이 꺼진다 */
  nudge?: boolean
  members?: (step: number) => LifeMember[]
}

/** 틱 스텝마다 tick을 부르고 (스텝, 출력)을 모은다. 마지막 줄은 직전 출력 스텝으로 넘긴다 */
function run(
  life: StudioLife,
  ids: readonly string[],
  fromStep: number,
  toStep: number,
  options: RunOptions = {},
): Timed[] {
  const timed: Timed[] = []
  let lastLineStep = fromStep
  for (let step = fromStep; step <= toStep; step += TICK_STEPS) {
    if (!life.isTickStep(step)) continue
    const context: LifeContext = {
      step,
      silence: false,
      members: options.members ? options.members(step) : ids.map((id) => member(id)),
      lastLineStep: options.nudge === false ? step : lastLineStep,
    }
    for (const output of life.tick(context)) {
      timed.push({ step, output })
      lastLineStep = step
    }
  }
  return timed
}

function bursts(timed: readonly Timed[]): { step: number; output: BurstOutput }[] {
  return timed.flatMap(({ step, output }) =>
    output.type === 'burst' ? [{ step, output }] : [],
  )
}

function habits(timed: readonly Timed[]): { step: number; output: HabitOutput }[] {
  return timed.flatMap(({ step, output }) =>
    output.type === 'habit' ? [{ step, output }] : [],
  )
}

function stages(timed: readonly Timed[]): { step: number; output: StageOutput }[] {
  return timed.flatMap(({ step, output }) =>
    output.type === 'stage' ? [{ step, output }] : [],
  )
}

/** 2단계로 유지되는 감정(기준값 baseline)을 가진 출연자 한 명짜리 life */
function stage2Life(seed: number, baseline: number, extra: Partial<MindDef> = {}): StudioLife {
  return makeLife(seed, [
    performer(
      'a',
      mindDef({ baseline: { irritation: baseline }, bursts: BURSTS, ...extra }),
    ),
  ])
}

describe('체감 목표', () => {
  it('2단계 진입 뒤 몸 3초 안에는 큰 터짐이 없다(시드 200개)', () => {
    for (const seed of SEEDS) {
      const timed = run(stage2Life(seed, 85), ['a'], 0, GRACE_STEPS - 1, { nudge: false })
      expect(bursts(timed).filter(({ output }) => output.size === 'big')).toEqual([])
    }
  })

  it('유예 뒤 큰 터짐까지 평균이 몸 8초 이상이다(시드 200개, 2단계 유지)', () => {
    const chance = 1 - Math.exp(-LIFE_TICK_BODY_SECONDS / BIG_BURST_MTB_BODY_SECONDS)
    // 유예가 끝나는 틱에서 첫 판정을 하므로 순수 대기 기댓값은 0.5/p - 0.5다
    const expected = LIFE_TICK_BODY_SECONDS / chance - LIFE_TICK_BODY_SECONDS
    expect(expected).toBeGreaterThanOrEqual(8)

    const waits: number[] = []
    for (const seed of SEEDS) {
      const timed = run(stage2Life(seed, 85), ['a'], 0, REAL_SECONDS_STEPS(600), { nudge: false })
      const big = bursts(timed).find(({ output }) => output.size === 'big')
      expect(big).toBeDefined()
      waits.push((big!.step - GRACE_STEPS) / STEPS_PER_SECOND)
    }
    const mean = waits.reduce((sum, wait) => sum + wait, 0) / waits.length
    expect(Math.abs(mean - expected)).toBeLessThanOrEqual(expected * 0.15)
  })

  it.each([
    { boredom: 0, minReal: 10, maxReal: 20 },
    { boredom: 100, minReal: 6, maxReal: 12 },
  ])('버릇 간격은 지루함 $boredom이면 실제 $minReal~$maxReal초다', ({ boredom, minReal, maxReal }) => {
    const habitList = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((id) => habit(id))
    const gaps: number[] = []
    const firstSteps: number[] = []
    for (const seed of SEEDS.slice(0, 40)) {
      const life = makeLife(seed, [
        performer('a', mindDef({ baseline: { boredom }, habits: habitList })),
      ])
      const steps = habits(run(life, ['a'], 0, REAL_SECONDS_STEPS(300), { nudge: false })).map(
        ({ step }) => step,
      )
      firstSteps.push(steps[0])
      steps.slice(1).forEach((step, index) => gaps.push(step - steps[index]))
    }
    const lowest = REAL_SECONDS_STEPS(minReal)
    const highest = REAL_SECONDS_STEPS(maxReal)
    // 틱 판정이라 시각은 최대 틱 한 번만큼 늦는다
    for (const gap of [...gaps, ...firstSteps]) {
      expect(gap).toBeGreaterThanOrEqual(lowest)
      expect(gap).toBeLessThanOrEqual(highest + TICK_STEPS)
    }
    expect(Math.min(...gaps)).toBeLessThan(lowest + REAL_SECONDS_STEPS(1.5))
    expect(Math.max(...gaps)).toBeGreaterThan(highest - REAL_SECONDS_STEPS(1.5))
  })
})

it('재촉: 줄이 없으면 실제 4초(+틱) 안에 누군가 버릇을 한다', () => {
  const nudgeSteps = showSecondsToSteps(LOG_NUDGE_SHOW_SECONDS, TALK_SHOW)
  expect(nudgeSteps).toBe(REAL_SECONDS_STEPS(4))
  for (const seed of SEEDS.slice(0, 20)) {
    const ids = ['a', 'b', 'c', 'd']
    const life = makeLife(
      seed,
      ids.map((id) => performer(id, mindDef({ habits: [habit('h1'), habit('h2')] }))),
    )
    const first = run(life, ids, 0, REAL_SECONDS_STEPS(20))[0]
    expect(first.output.type).toBe('habit')
    expect(first.step).toBeLessThanOrEqual(nudgeSteps + TICK_STEPS)
  }
})

it('재촉: 지난 줄이 최근이면 버릇을 당기지 않는다', () => {
  const life = makeLife(1, [performer('a', mindDef({ habits: [habit('h1')] }))])
  const timed = run(life, ['a'], 0, REAL_SECONDS_STEPS(9), { nudge: false })
  expect(timed).toEqual([])
})

it('resting인 출연자는 버릇과 터짐을 미루고 감정은 계속 쌓인다', () => {
  const life = stage2Life(3, 85, { habits: [habit('h1'), habit('h2')] })
  const resting = run(life, ['a'], 0, REAL_SECONDS_STEPS(120), {
    members: () => [member('a', { resting: true })],
  })
  expect(resting.filter(({ output }) => output.type !== 'stage')).toEqual([])
  expect(life.mood('a')?.stage).toBe(2)
  expect(stages(resting).map(({ output }) => output.stage)).toEqual([2])

  const awake = run(life, ['a'], REAL_SECONDS_STEPS(120), REAL_SECONDS_STEPS(400))
  expect(bursts(awake).length + habits(awake).length).toBeGreaterThan(0)
})

describe('터짐', () => {
  function firstBig(life: StudioLife, members?: (step: number) => LifeMember[]) {
    const timed = run(life, ['a'], 0, REAL_SECONDS_STEPS(900), { nudge: false, members })
    const found = bursts(timed).find(({ output }) => output.size === 'big')
    if (!found) throw new Error('큰 터짐이 나오지 않았습니다')
    return found
  }

  it('큰 터짐은 이유를 지우고 후련함을 붙여 곧바로 다시 터지지 않는다', () => {
    const sensitivities: MindDef['sensitivities'] = [
      { emotion: 'irritation', on: 'event', kind: 'noise', scope: 'perceived', amount: 20 },
    ]
    const life = stage2Life(5, 85, { sensitivities })
    life.perceive([makeEvent()], [perceiver('a')], 0)
    expect(life.emotions('a')[0].reasons).toHaveLength(1)

    const timed = run(life, ['a'], 0, REAL_SECONDS_STEPS(900), { nudge: false })
    const first = bursts(timed).find(({ output }) => output.size === 'big')!
    expect(first).toBeDefined()
    const after = timed.filter(({ step }) => step > first.step)
    const within = after.filter(({ step }) => step <= first.step + REAL_SECONDS_STEPS(20))
    expect(bursts(within).filter(({ output }) => output.size === 'big')).toEqual([])
    expect(life.burstRecords().filter((record) => record.size === 'big')[0]).toMatchObject({
      step: first.step,
      actorId: 'a',
      emotion: 'irritation',
      stage2Step: 0,
    })
  })

  it('큰 터짐 직후에는 사건 이유가 지워지고 값이 후련함만큼 내려간다', () => {
    const sensitivities: MindDef['sensitivities'] = [
      { emotion: 'irritation', on: 'event', kind: 'noise', scope: 'perceived', amount: 20 },
    ]
    const life = stage2Life(5, 85, { sensitivities })
    life.perceive([makeEvent()], [perceiver('a')], 0)
    const timed = run(life, ['a'], 0, REAL_SECONDS_STEPS(900), { nudge: false })
    const first = bursts(timed).find(({ output }) => output.size === 'big')!
    expect(first.output.top).toHaveLength(1)
    // 같은 시드를 터짐 직후 틱까지만 다시 돌려 상태를 본다
    const replay = stage2Life(5, 85, { sensitivities })
    replay.perceive([makeEvent()], [perceiver('a')], 0)
    run(replay, ['a'], 0, first.step, { nudge: false })
    const view = replay.emotions('a')[0]
    expect(view.reasons).toEqual([])
    expect(view.value).toBeLessThanOrEqual(85 - 40 + 1e-6)
  })

  it('큰 터짐 값이 95 이상이면 intense이고 강도 2 emit이 3이 된다', () => {
    const first = firstBig(stage2Life(7, 96))
    expect(first.output.intense).toBe(true)
    expect(first.output.burst.action.emits.map((emit) => emit.intensity)).toEqual([3, 1])
    // 원본 콘텐츠는 바뀌지 않는다
    expect(BURSTS.irritation.big.action.emits.map((emit) => emit.intensity)).toEqual([2, 1])
  })

  it('큰 터짐 값이 95 미만이면 intense가 아니고 행동은 그대로다', () => {
    const first = firstBig(stage2Life(7, 85))
    expect(first.output.intense).toBe(false)
    expect(first.output.burst.action.emits.map((emit) => emit.intensity)).toEqual([2, 1])
  })

  it('터짐의 cause는 가장 큰 이유가 사건이면 그 사건, 상황이면 null이다', () => {
    const event = makeEvent()
    const eventLife = stage2Life(9, 85, {
      sensitivities: [
        { emotion: 'irritation', on: 'event', kind: 'noise', scope: 'perceived', amount: 5 },
      ],
    })
    eventLife.perceive([event], [perceiver('a')], 0)
    const byEvent = firstBig(eventLife)
    expect(byEvent.output.cause).toEqual(event)
    expect(byEvent.output.top[0].source).toEqual({ type: 'event', event })

    const situationLife = stage2Life(9, 85, {
      sensitivities: [
        {
          emotion: 'irritation',
          on: 'situation',
          situation: { kind: 'offScreen' },
          perShowMinute: 600,
          label: { noun: '무시', clause: '한참 화면에 안 잡힌' },
        },
      ],
    })
    const bySituation = firstBig(situationLife, () => [member('a', { onAir: false })])
    expect(bySituation.output.top[0].source.type).toBe('situation')
    expect(bySituation.output.cause).toBeNull()
  })

  it('작은 터짐은 1단계 이상에서 일어나고 이유를 0.6배로 줄이며 쿨다운이 있다', () => {
    const sensitivities: MindDef['sensitivities'] = [
      { emotion: 'irritation', on: 'event', kind: 'noise', scope: 'perceived', amount: 10 },
    ]
    const cooldown = showSecondsToSteps(SMALL_BURST_COOLDOWN_SHOW_SECONDS, TALK_SHOW)
    let checked = false
    for (const seed of SEEDS.slice(0, 20)) {
      const life = stage2Life(seed, 45, { sensitivities })
      life.perceive([makeEvent({ intensity: 2 })], [perceiver('a')], 0)
      const smallSteps: number[] = []
      for (let step = 0; step <= REAL_SECONDS_STEPS(300); step += TICK_STEPS) {
        const outputs = life.tick({
          step,
          silence: false,
          members: [member('a')],
          lastLineStep: step,
        })
        const small = bursts(outputs.map((output) => ({ step, output }))).find(
          ({ output }) => output.size === 'small',
        )
        if (!small) continue
        smallSteps.push(step)
        const before = small.output.top[0]
        if (before && !checked) {
          const after = life.emotions('a')[0].reasons[0]
          expect(after.amount).toBeCloseTo(before.amount * SMALL_BURST_KEEP, 6)
          checked = true
        }
      }
      expect(life.mood('a')?.stage).toBeGreaterThanOrEqual(1)
      smallSteps.slice(1).forEach((step, index) => {
        expect(step - smallSteps[index]).toBeGreaterThanOrEqual(cooldown)
      })
      expect(smallSteps.length).toBeGreaterThan(5)
    }
    expect(checked).toBe(true)
  })
})

it('단계 진입 줄은 같은 감정·단계에 실제 12초 안에 두 번 나오지 않는다', () => {
  const cooldown = showSecondsToSteps(STAGE_LINE_COOLDOWN_SHOW_SECONDS, TALK_SHOW)
  const life = makeLife(1, [performer('a', mindDef())])
  life.addDirective('a', [{ emotion: 'irritation', amount: 60 }], 'a', 0)
  const entered = run(life, ['a'], 0, 390, { nudge: false })
  expect(stages(entered).map(({ step, output }) => [step, output.stage])).toEqual([[0, 1]])
  expect(life.mood('a')?.stage).toBe(0)

  life.addDirective('a', [{ emotion: 'irritation', amount: 20 }], 'b', 390)
  const reentered = run(life, ['a'], 420, 600, { nudge: false })
  expect(life.mood('a')?.stage).toBe(1)
  expect(stages(reentered)).toEqual([])
  expect(600).toBeLessThan(cooldown)
})

describe('응답', () => {
  const chuckle = habit('chuckle', {
    targetLine: '{target:을} 본다',
    stir: { kind: 'laughter', target: 'cause' },
    respondsTo: { kinds: ['laughter'], chance: 1 },
  })

  function responseLife(seed = 1): StudioLife {
    return makeLife(seed, [
      performer('a', mindDef({ habits: [chuckle] })),
      performer('b', mindDef()),
    ])
  }

  function laughterAt(step: number, overrides: Partial<PhenomenonEvent> = {}): PhenomenonEvent {
    return makeEvent({
      kind: 'laughter',
      intensity: 0,
      sourceId: 'b',
      targetId: 'a',
      step,
      ...overrides,
    })
  }

  it('응답 버릇: 나를 향한 기척 웃음을 받으면 다음 틱에 chance로 응수하고 대상은 웃은 사람이다', () => {
    const life = responseLife()
    const event = laughterAt(10)
    life.perceive([event], [perceiver('a'), perceiver('b')], 10)
    const timed = run(life, ['a', 'b'], 30, 30, { nudge: false })
    expect(habits(timed)).toHaveLength(1)
    const response = habits(timed)[0].output
    expect(response).toMatchObject({
      actorId: 'a',
      cause: event,
      target: { kind: 'actor', id: 'b' },
    })
    expect(response.habit.id).toBe('chuckle')
    expect(life.recentHabit('a', 30)?.id).toBe('chuckle')
  })

  it('나를 향하지 않았거나 응답하지 않는 종류는 대기열에 들지 않는다', () => {
    const life = responseLife()
    const other = laughterAt(10, { targetId: null })
    const noise = laughterAt(10, { kind: 'noise', targetId: 'a' })
    life.perceive([other, noise], [perceiver('a'), perceiver('b')], 10)
    expect(run(life, ['a', 'b'], 30, 30, { nudge: false })).toEqual([])
  })

  it('chance가 0이면 응수하지 않는다', () => {
    const quiet = habit('quiet', { respondsTo: { kinds: ['laughter'], chance: 0 } })
    const life = makeLife(1, [
      performer('a', mindDef({ habits: [quiet] })),
      performer('b', mindDef()),
    ])
    life.perceive([laughterAt(10)], [perceiver('a')], 10)
    expect(run(life, ['a', 'b'], 30, 30, { nudge: false })).toEqual([])
  })

  it('응답 쿨다운 안에는 다시 응답하지 않아 주고받기가 끝난다', () => {
    const cooldown = showSecondsToSteps(RESPONSE_COOLDOWN_SHOW_SECONDS, TALK_SHOW)
    const life = responseLife()
    const respond = (eventStep: number, tickStep: number) => {
      life.perceive([laughterAt(eventStep)], [perceiver('a')], eventStep)
      return habits(run(life, ['a', 'b'], tickStep, tickStep, { nudge: false }))
    }
    expect(respond(10, 30)).toHaveLength(1)
    expect(respond(40, 60)).toHaveLength(0)
    expect(respond(30 + cooldown - 10, 30 + cooldown)).toHaveLength(1)
  })

  it('응답 대상이 그 사이에 leave했으면 대상 없이(null) 응답한다', () => {
    const life = responseLife()
    life.perceive([laughterAt(10)], [perceiver('a'), perceiver('b')], 10)
    life.leave('b')
    const timed = run(life, ['a'], 30, 30, { nudge: false })
    expect(habits(timed)[0].output.target).toBeNull()
  })

  it('응답 대기열은 틱마다 비워져 이전 틱의 현상으로 응답하지 않는다', () => {
    const life = makeLife(1, [
      performer(
        'a',
        mindDef({
          habits: [
            habit('chuckle', { respondsTo: { kinds: ['laughter'], chance: 1 } }),
          ],
        }),
      ),
    ])
    const resting = (isResting: boolean) => () => [member('a', { resting: isResting })]
    life.perceive([laughterAt(10)], [perceiver('a')], 10)
    expect(run(life, ['a'], 30, 30, { nudge: false, members: resting(true) })).toEqual([])
    expect(run(life, ['a'], 60, 60, { nudge: false, members: resting(false) })).toEqual([])
  })
})

describe('버릇 조건과 쿨다운', () => {
  const cases: {
    name: string
    when: HabitDef['when']
    unmet: LifeMember
    met: LifeMember
  }[] = [
    {
      name: 'offScreen',
      when: [{ kind: 'offScreen' }],
      unmet: member('a', { onAir: true }),
      met: member('a', { onAir: false }),
    },
    {
      name: 'onScreen',
      when: [{ kind: 'onScreen' }],
      unmet: member('a', { onAir: false }),
      met: member('a', { onAir: true }),
    },
    {
      name: 'nearTag present',
      when: [{ kind: 'nearTag', tag: 'host', present: true }],
      unmet: member('a', { nearTags: [] }),
      met: member('a', { nearTags: ['host'] }),
    },
    {
      name: 'nearTag absent',
      when: [{ kind: 'nearTag', tag: 'host', present: false }],
      unmet: member('a', { nearTags: ['host'] }),
      met: member('a', { nearTags: [] }),
    },
  ]

  function conditionLife(when: HabitDef['when'], baseline: number): StudioLife {
    return makeLife(1, [
      performer(
        'a',
        mindDef({ baseline: { irritation: baseline }, habits: [habit('h1', { when })] }),
      ),
    ])
  }

  const nudgeWindow = REAL_SECONDS_STEPS(8)

  it.each(cases)(
    '조건($name)을 만족하지 않으면 뽑히지 않고 만족하면 뽑힌다',
    ({ when, unmet, met }) => {
      const blocked = run(conditionLife(when, 0), ['a'], 0, nudgeWindow, {
        members: () => [unmet],
      })
      expect(habits(blocked)).toEqual([])
      const allowed = run(conditionLife(when, 0), ['a'], 0, nudgeWindow, {
        members: () => [met],
      })
      expect(habits(allowed).length).toBeGreaterThan(0)
    },
  )

  it('조건(stage)은 그 감정이 단계에 이르러야 한다', () => {
    const when: HabitDef['when'] = [{ kind: 'stage', emotion: 'irritation', atLeast: 1 }]
    expect(habits(run(conditionLife(when, 0), ['a'], 0, nudgeWindow))).toEqual([])
    expect(habits(run(conditionLife(when, 60), ['a'], 0, nudgeWindow)).length).toBeGreaterThan(0)
  })

  it('조건(showTrait)은 쇼 속성에 있어야 한다', () => {
    const absent: HabitDef['when'] = [{ kind: 'showTrait', trait: 'nowhere' }]
    const present: HabitDef['when'] = [{ kind: 'showTrait', trait: 'talk' }]
    expect(habits(run(conditionLife(absent, 0), ['a'], 0, nudgeWindow))).toEqual([])
    expect(habits(run(conditionLife(present, 0), ['a'], 0, nudgeWindow)).length).toBeGreaterThan(0)
  })

  it('조건이 여럿이면 모두 만족해야 뽑힌다', () => {
    const when: HabitDef['when'] = [
      { kind: 'offScreen' },
      { kind: 'nearTag', tag: 'host', present: true },
    ]
    const onlyOne = run(conditionLife(when, 0), ['a'], 0, nudgeWindow, {
      members: () => [member('a', { onAir: false })],
    })
    expect(habits(onlyOne)).toEqual([])
  })

  it('같은 버릇은 실제 30초 안에 다시 뽑히지 않는다', () => {
    const cooldown = showSecondsToSteps(HABIT_COOLDOWN_SHOW_SECONDS, TALK_SHOW)
    const life = makeLife(1, [performer('a', mindDef({ habits: [habit('h1')] }))])
    const steps = habits(run(life, ['a'], 0, REAL_SECONDS_STEPS(100))).map(({ step }) => step)
    expect(steps.length).toBeGreaterThanOrEqual(2)
    steps.slice(1).forEach((step, index) => {
      expect(step - steps[index]).toBeGreaterThanOrEqual(cooldown)
    })
  })

  it('boost가 있는 버릇이 더 자주 뽑힌다', () => {
    const picks = { plain: 0, boosted: 0 }
    for (const seed of SEEDS.slice(0, 50)) {
      const life = makeLife(seed, [
        performer(
          'a',
          mindDef({
            baseline: { boredom: 100 },
            habits: [
              habit('plain'),
              habit('boosted', { boost: { emotion: 'boredom', factor: 4 } }),
            ],
          }),
        ),
      ])
      const first = habits(run(life, ['a'], 0, REAL_SECONDS_STEPS(12)))[0]
      picks[first.output.habit.id as 'plain' | 'boosted'] += 1
    }
    expect(picks.boosted).toBeGreaterThan(picks.plain * 2)
  })
})

describe('habit 대상 해석', () => {
  function targetOf(target: NonNullable<HabitDef['stir']>['target']) {
    const life = makeLife(1, [
      performer(
        'a',
        mindDef({
          habits: [habit('h1', { stir: { kind: 'noise', target } })],
        }),
      ),
    ])
    return habits(run(life, ['a'], 0, REAL_SECONDS_STEPS(8)))[0].output.target
  }

  it('none은 null, nearestPerformer와 tag는 selector, cause는 시계 버릇이면 null이다', () => {
    expect(targetOf('none')).toBeNull()
    expect(targetOf('nearestPerformer')).toEqual({ kind: 'selector', selector: 'nearestPerformer' })
    expect(targetOf({ tag: 'host' })).toEqual({ kind: 'selector', selector: { tag: 'host' } })
    expect(targetOf('cause')).toBeNull()
  })

  it('topContributor는 가장 높은 감정의 가장 큰 이유가 사건이고 그 source가 있을 때만 actor다', () => {
    const sensitivities: MindDef['sensitivities'] = [
      { emotion: 'irritation', on: 'event', kind: 'noise', scope: 'perceived', amount: 10 },
    ]
    const build = (joinB: boolean) => {
      const defs = [
        performer(
          'a',
          mindDef({
            sensitivities,
            habits: [habit('h1', { stir: { kind: 'noise', target: 'topContributor' } })],
          }),
        ),
      ]
      if (joinB) defs.push(performer('b', mindDef()))
      const life = makeLife(1, defs)
      life.perceive([makeEvent()], [perceiver('a')], 0)
      return habits(run(life, ['a'], 0, REAL_SECONDS_STEPS(8)))[0].output.target
    }
    expect(build(true)).toEqual({ kind: 'actor', id: 'b' })
    expect(build(false)).toBeNull()
  })
})

it('resetAll 뒤에는 단계 0이고 2단계 유예 중이던 감정도 터지지 않는다', () => {
  const life = makeLife(2, [performer('a', mindDef({ bursts: BURSTS }))])
  life.addDirective('a', [{ emotion: 'irritation', amount: 90 }], '지시', 0)
  expect(run(life, ['a'], 0, 0, { nudge: false })).not.toEqual([])
  expect(life.mood('a')?.stage).toBe(2)

  life.resetAll(30)
  expect(life.mood('a')).toMatchObject({ stage: 0, value: 0 })
  expect(life.recentHabit('a', 30)).toBeNull()
  const after = run(life, ['a'], 60, REAL_SECONDS_STEPS(600), { nudge: false })
  expect(bursts(after)).toEqual([])
  expect(life.mood('a')?.stage).toBe(0)
})

it('mind가 없는 출연자는 join해도 has가 false이고 mood가 null이다', () => {
  const life = makeLife(1, [performer('a')])
  expect(life.has('a')).toBe(false)
  expect(life.mood('a')).toBeNull()
  expect(life.emotions('a')).toEqual([])
  expect(run(life, ['a'], 0, REAL_SECONDS_STEPS(10))).toEqual([])
})

it('leave하면 has가 false가 되고 더는 출력하지 않는다', () => {
  const life = makeLife(1, [performer('a', mindDef({ habits: [habit('h1')] }))])
  expect(life.has('a')).toBe(true)
  life.leave('a')
  expect(life.has('a')).toBe(false)
  expect(run(life, ['a'], 0, REAL_SECONDS_STEPS(10))).toEqual([])
})

describe('mood와 emotions', () => {
  function moodLife(shifts: Record<string, number>): StudioLife {
    const life = makeLife(1, [performer('a', mindDef())])
    for (const [emotion, amount] of Object.entries(shifts)) {
      life.addDirective('a', [{ emotion, amount }], emotion, 0)
    }
    run(life, ['a'], 0, 0, { nudge: false })
    return life
  }

  it('대표 감정은 높은 단계, 같으면 다음 문턱에 가까운 쪽이다', () => {
    expect(moodLife({ irritation: 60, boredom: 75 }).mood('a')).toMatchObject({
      emotion: 'boredom',
      stage: 1,
      stageName: '지루함',
    })
    expect(moodLife({ irritation: 60, anxiety: 85 }).mood('a')).toMatchObject({
      emotion: 'anxiety',
      stage: 2,
      stageName: '패닉 직전',
    })
  })

  it('단계와 문턱 거리가 같으면 정의 순서가 앞선 감정이다', () => {
    expect(moodLife({ boredom: 60, irritation: 60 }).mood('a')?.emotion).toBe('irritation')
  })

  it('모두 0단계면 stageName이 null이다', () => {
    const view = moodLife({ excitement: 45 }).mood('a')
    expect(view).toMatchObject({ emotion: 'excitement', stage: 0, stageName: null, value: 45 })
  })

  it('emotions는 감정마다 값, 단계, 올라가는 문턱, 이유를 돌려준다', () => {
    const views = moodLife({ irritation: 60 }).emotions('a')
    expect(views.map((view) => view.id)).toEqual(['irritation', 'excitement', 'anxiety', 'boredom'])
    expect(views[0]).toMatchObject({ value: 60, stage: 1, rise: [50, 80] })
    expect(views[0].reasons[0].source).toEqual({ type: 'directive', label: 'irritation' })
  })
})

it('recentHabit은 회상 범위 안의 마지막 버릇만 돌려준다', () => {
  const life = makeLife(1, [performer('a', mindDef({ habits: [habit('h1')] }))])
  const first = habits(run(life, ['a'], 0, REAL_SECONDS_STEPS(8)))[0]
  const recall = showSecondsToSteps(RECALL_SHOW_SECONDS, TALK_SHOW)
  expect(life.recentHabit('a', first.step + recall)?.id).toBe('h1')
  expect(life.recentHabit('a', first.step + recall + 1)).toBeNull()
})

it('같은 시드와 같은 컨텍스트 열이면 같은 출력이다', () => {
  const build = (seed: number) => {
    const ids = ['a', 'b', 'c']
    const life = makeLife(
      seed,
      ids.map((id) =>
        performer(
          id,
          mindDef({
            baseline: { irritation: 70 },
            bursts: BURSTS,
            habits: [habit('h1'), habit('h2'), habit('h3')],
          }),
        ),
      ),
    )
    return run(life, ids, 0, REAL_SECONDS_STEPS(240))
  }
  const first = build(12)
  expect(first.length).toBeGreaterThan(10)
  expect(build(12)).toEqual(first)
  expect(build(13)).not.toEqual(first)
})

it('resting 중에도 감정이 쌓인다(offScreen 상황)', () => {
  const life = makeLife(1, [
    performer(
      'a',
      mindDef({
        sensitivities: [
          {
            emotion: 'irritation',
            on: 'situation',
            situation: { kind: 'offScreen' },
            perShowMinute: 6,
            label: { noun: '무시', clause: '한참 화면에 안 잡힌' },
          },
        ],
        habits: [habit('h1')],
      }),
    ),
  ])
  const restingOffAir = () => [member('a', { onAir: false, resting: true })]
  run(life, ['a'], 0, TICK_STEPS, { members: restingOffAir })
  const early = life.emotions('a')[0].value
  const timed = run(life, ['a'], TICK_STEPS * 2, REAL_SECONDS_STEPS(60), {
    members: restingOffAir,
  })
  expect(timed.filter(({ output }) => output.type !== 'stage')).toEqual([])
  expect(life.emotions('a')[0].value).toBeGreaterThan(early + 10)
})

describe('재촉 대상', () => {
  const ids = ['a', 'b', 'c', 'd']
  const defs = (): PerformerDef[] =>
    ids.map((id) =>
      performer(
        id,
        mindDef({
          habits:
            id === 'b'
              ? [habit('never', { when: [{ kind: 'showTrait', trait: 'nowhere' }] })]
              : [habit('h1'), habit('h2')],
        }),
      ),
    )
  const members = () => ids.map((id) => member(id, { resting: id === 'a' }))

  it('resting이거나 후보가 없는 출연자는 제외하고 버릇 시각이 가장 이른 출연자가 뽑힌다', () => {
    const nudgeSteps = showSecondsToSteps(LOG_NUDGE_SHOW_SECONDS, TALK_SHOW)
    let compared = 0
    for (const seed of SEEDS.slice(0, 30)) {
      // 같은 시드의 시계만 돌려 버릇 시각이 가장 이른 출연자를 알아낸다
      const reference = habits(
        run(makeLife(seed, defs()), ids, 0, REAL_SECONDS_STEPS(30), {
          nudge: false,
          members,
        }),
      )
      if (reference.length > 1 && reference[1].step === reference[0].step) continue
      const nudged = habits(
        run(makeLife(seed, defs()), ids, 0, nudgeSteps, { members }),
      )
      expect(nudged).toHaveLength(1)
      expect(['c', 'd']).toContain(nudged[0].output.actorId)
      expect(nudged[0].output.actorId).toBe(reference[0].output.actorId)
      compared += 1
    }
    expect(compared).toBeGreaterThan(10)
  })
})

it('같은 틱에 터진 출연자는 응답 대기 중이어도 응답하지 않는다', () => {
  const chuckle = habit('chuckle', { respondsTo: { kinds: ['laughter'], chance: 1 } })
  let burstTicks = 0
  for (const seed of SEEDS.slice(0, 40)) {
    const life = stage2Life(seed, 85, { habits: [chuckle] })
    for (let step = 0; step <= REAL_SECONDS_STEPS(120); step += TICK_STEPS) {
      life.perceive(
        [makeEvent({ kind: 'laughter', intensity: 0, targetId: 'a', step })],
        [perceiver('a')],
        step - 1,
      )
      const outputs = life.tick({
        step,
        silence: false,
        members: [member('a')],
        lastLineStep: step,
      })
      if (!outputs.some((output) => output.type === 'burst')) continue
      burstTicks += 1
      expect(outputs.some((output) => output.type === 'habit')).toBe(false)
    }
  }
  expect(burstTicks).toBeGreaterThan(10)
})

describe('pickWeighted', () => {
  const mind = new Mind(mindDef(), TALK_SHOW, 0)
  const neverRoll = () => {
    throw new Error('난수를 쓰면 안 됩니다')
  }

  it('가중치 합이 0 이하이면 난수를 쓰지 않고 null이다', () => {
    expect(pickWeighted([habit('zero', { weight: 0 })], mind, neverRoll)).toBeNull()
    expect(
      pickWeighted([habit('minus', { weight: -3 }), habit('zero', { weight: 0 })], mind, neverRoll),
    ).toBeNull()
  })

  it('음수 가중치는 0으로 보고 나머지에서 고른다', () => {
    const picked = pickWeighted([habit('minus', { weight: -5 }), habit('ok')], mind, () => 0)
    expect(picked?.id).toBe('ok')
  })

  it('후보가 없으면 난수를 쓰지 않고 null이다', () => {
    expect(pickWeighted([], mind, neverRoll)).toBeNull()
  })
})
