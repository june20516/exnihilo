import { afterEach, describe, expect, it } from 'vitest'
import { COMMON_EMOTION_DEFS } from '@/content/emotions'
import { STEP_SECONDS } from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { tuned } from '@/content/tuning'
import type { BurstDef, HabitDef, PerformerDef } from '@/content/types'
import { fixtureColor } from '@/test-support/fixtureColor'
import { Broadcast, type BroadcastInput, type BroadcastSetup } from './engine'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const PRESS_GUEST: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'pressGuest' }
const REX_STEP_UP: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'stepUp' }

const opened: Broadcast[] = []

afterEach(() => {
  for (const broadcast of opened.splice(0)) broadcast.dispose()
})

async function open(setup: BroadcastSetup): Promise<Broadcast> {
  const broadcast = await Broadcast.create(setup)
  opened.push(broadcast)
  return broadcast
}

/** 실제 라인업. 지시 연쇄를 보는 테스트가 쓴다. */
function lineupSetup(): BroadcastSetup {
  return {
    show: TALK_SHOW,
    performers: LINEUP.performers,
    bench: LINEUP.bench,
    staff: LINEUP.staff,
    equipment: LINEUP.equipment,
    seed: 7,
  }
}

function run(broadcast: Broadcast, steps: number): void {
  for (let i = 0; i < steps; i++) broadcast.step()
}

describe('연쇄 줄의 주인공', () => {
  it('longestChain 줄의 actorId는 사건 주인공 출연자, 장비·관객이면 null', async () => {
    const broadcast = await open(lineupSetup())
    run(broadcast, 10)
    // 프리야의 큰 웃음 -> 관객이 웃음을 터뜨리는 연쇄(관객은 출연자가 아니다)
    broadcast.step([{ type: 'direct', actorId: 'priya', directiveId: 'laughBig' }])
    run(broadcast, STEPS_PER_SECOND * 10)

    const chain = broadcast.longestChain()
    const audienceLines = chain.filter((line) => line.text.startsWith('관객'))
    expect(audienceLines.length).toBeGreaterThan(0)
    for (const line of audienceLines) expect(line.actorId).toBeNull()
    const performerIds = new Set([...LINEUP.performers, ...LINEUP.bench].map((p) => p.id))
    for (const line of chain.filter((candidate) => !candidate.text.startsWith('관객'))) {
      expect(performerIds.has(line.actorId ?? '')).toBe(true)
    }
    expect(chain.find((line) => line.text.startsWith('프리야'))?.actorId).toBe('priya')
  })
})

const WINK: HabitDef = {
  id: 'wink',
  line: '윙크한다',
  recall: '윙크하던',
  noun: '윙크',
  emote: '😉',
  pose: 'idle',
  weight: 1,
}

const QUIET_BURST_DEF: BurstDef = {
  small: { line: '몸을 비튼다', action: { pose: 'idle', emits: [] } },
  big: { line: '몸을 비튼다', action: { pose: 'idle', emits: [] } },
}

function winker(): PerformerDef {
  return {
    id: 'mo',
    name: '모',
    shortName: '모',
    color: fixtureColor('mo'),
    role: '역할',
    tendency: '성향',
    presence: 1,
    tolerance: 'max',
    weight: 'normal',
    tags: ['host'],
    reactions: [],
    directives: [],
    misfire: 'never',
    mind: {
      emotions: [...COMMON_EMOTION_DEFS],
      sensitivities: [],
      // 터짐은 쓰지 않지만 검증이 모든 감정의 터짐 정의를 요구한다
      bursts: Object.fromEntries(COMMON_EMOTION_DEFS.map((emotion) => [emotion.id, QUIET_BURST_DEF])),
      habits: [WINK],
    },
  }
}

describe('버릇 이모트', () => {
  it('버릇 직후 ActorView.habit.emote는 버릇 정의의 emote이고 EMOTE_BODY_SECONDS 뒤 null', async () => {
    const broadcast = await open({
      show: TALK_SHOW,
      performers: [winker()],
      bench: [],
      staff: [],
      equipment: [],
      seed: 1,
    })
    const habitOf = () => broadcast.view().actors[0].habit
    expect(habitOf()).toBeNull()
    const limit = STEPS_PER_SECOND * 600
    let spent = 0
    while (habitOf() === null && spent++ < limit) broadcast.step()
    const habit = habitOf()
    if (habit === null) throw new Error('버릇이 나오지 않았습니다.')
    expect(habit.emote).toBe(WINK.emote)

    const bodySteps = Math.round(tuned('EMOTE_BODY_SECONDS') * STEPS_PER_SECOND)
    // 시작 스텝부터 bodySteps 동안만 보인다
    while (broadcast.currentStep - habit.startedStep < bodySteps - 1) broadcast.step()
    expect(habitOf()?.startedStep).toBe(habit.startedStep)
    broadcast.step()
    expect(habitOf()?.startedStep).not.toBe(habit.startedStep)
  })
})

describe('이어받기 줄의 앞머리', () => {
  it('이어받은 사고 줄은 leadIn이 있고 text가 leadIn으로 시작한다. 다른 줄은 leadIn null', async () => {
    const setup = lineupSetup()
    // 반응과 mind를 지워 창 안에 지시 사고 말고는 연루가 없게 한다(engine.takeover.test와 같은 셋업)
    const bare = (performer: PerformerDef): PerformerDef => ({
      ...performer,
      reactions: [],
      mind: undefined,
      directives: performer.directives.map((directive) => ({ ...directive, moodShifts: undefined })),
    })
    const broadcast = await open({
      ...setup,
      performers: setup.performers.map(bare),
      bench: setup.bench.map(bare),
      staff: setup.staff.map((member) => ({ ...member, reactions: [] })),
      equipment: [],
      seed: 7,
    })
    run(broadcast, 10)
    broadcast.step([PRESS_GUEST])
    run(broadcast, STEPS_PER_SECOND)
    broadcast.step([REX_STEP_UP])

    const lines = broadcast.logLines()
    const led = lines.filter((line) => line.leadIn !== null)
    expect(led.length).toBeGreaterThan(0)
    for (const line of led) expect(line.text.startsWith(line.leadIn ?? '')).toBe(true)
    expect(led[0].leadIn).toMatch(/에 이어 $/)
    expect(lines.some((line) => line.leadIn === null)).toBe(true)
    // view의 줄도 같다
    expect(broadcast.view().log.every((line) => line.leadIn === null || line.text.startsWith(line.leadIn))).toBe(true)
  })
})
