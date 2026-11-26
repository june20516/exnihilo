import { afterEach, describe, expect, it } from 'vitest'
import { STEP_SECONDS, TAKEOVER_BODY_SECONDS, TOLERANCE_COUNT } from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { describeEvent } from './describe'
import { eventNoun } from './narration'
import { Broadcast, type BroadcastInput, type LogLine } from './engine'
import type { Perceiver, PhenomenonEvent } from './phenomena'
import {
  activeInvolvement,
  remainingTakeoverSteps,
  takeoverWindowSteps,
  updateInvolvement,
  type InvolvementMap,
} from './takeover'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const WINDOW_STEPS = takeoverWindowSteps(TAKEOVER_BODY_SECONDS, STEPS_PER_SECOND)

const PRESS_GUEST: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'pressGuest' }
const REX_STEP_UP: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'stepUp' }
const OKAFOR_REBUT: BroadcastInput = { type: 'direct', actorId: 'okafor', directiveId: 'rebut' }

/** 사고 문구에 쓰는 출연자 이름(엔진의 names와 같은 shortName) */
const PERFORMER_NAMES: Record<string, string> = Object.fromEntries(
  LINEUP.performers.map((performer) => [performer.id, performer.shortName]),
)

const opened: Broadcast[] = []

afterEach(() => {
  for (const broadcast of opened.splice(0)) broadcast.dispose()
})

/**
 * 실제 라인업에서 반응과 mind(와 mind가 있어야 하는 지시의 moodShifts)를 지운다. 지시 행동은 그대로다.
 * 테스트는 창 안에 지시가 만든 사고 말고는 출연자를 연루시키는 사고가 없어 기억이 덮어쓰이지 않는다는
 * 전제에 기댄다. 그래서 반응·터짐(mind)·장비 파손이 없고, 스태프도 반응하지 않는다. 관객은 웃음에만
 * 반응하는데 여기서 쓰는 지시(렉스 압박·나서기, 오카포 반박)는 분노와 소음만 낸다. 관객 소음은 관객석이
 * 송출될 때만 나는데 송출 카메라를 바꾸지 않는다. 방송 정적은 연루가 아니다. 대기석(준)은 광고 setup 효과용이다.
 */
async function open(): Promise<Broadcast> {
  const broadcast = await Broadcast.create({
    show: TALK_SHOW,
    performers: LINEUP.performers.map((performer) => ({
      ...performer,
      reactions: [],
      mind: undefined,
      directives: performer.directives.map((directive) => ({ ...directive, moodShifts: undefined })),
    })),
    bench: LINEUP.bench.map((performer) => ({
      ...performer,
      reactions: [],
      mind: undefined,
      directives: performer.directives.map((directive) => ({ ...directive, moodShifts: undefined })),
    })),
    staff: LINEUP.staff.map((member) => ({ ...member, reactions: [] })),
    equipment: [],
    seed: 7,
  })
  opened.push(broadcast)
  return broadcast
}

function run(broadcast: Broadcast, steps: number): void {
  for (let i = 0; i < steps; i++) broadcast.step()
}

/** 이번 스텝에 입력을 넣고, 그 스텝에 출연자가 낸 첫 사고를 돌려준다. */
function directAndFind(broadcast: Broadcast, input: BroadcastInput): PhenomenonEvent {
  if (input.type !== 'direct') throw new Error('출연자 지시만 받습니다.')
  const step = broadcast.currentStep
  broadcast.step([input])
  const event = broadcast
    .events()
    .find((candidate) => candidate.step === step && candidate.sourceId === input.actorId)
  if (event === undefined) throw new Error(`${input.actorId}의 사고가 없습니다.`)
  return event
}

function lineOf(broadcast: Broadcast, event: PhenomenonEvent): LogLine {
  const line = broadcast.logLines().find((candidate) => candidate.eventId === event.id)
  if (line === undefined) throw new Error(`사고 ${event.id}의 줄이 없습니다.`)
  return line
}

function takeoverOf(broadcast: Broadcast, actorId: string) {
  const actor = broadcast.view().actors.find((candidate) => candidate.id === actorId)
  if (actor === undefined) throw new Error(`없는 출연자입니다: ${actorId}`)
  return actor.takeover
}

describe('지시로 연쇄 이어받기', () => {
  it('출연자가 몸 5초 안에 연루된 사고를 지시가 이어받아 깊이가 +1이 된다', async () => {
    const broadcast = await open()
    run(broadcast, 10)
    const first = directAndFind(broadcast, PRESS_GUEST)
    expect(first.intensity).toBeGreaterThanOrEqual(1)
    run(broadcast, STEPS_PER_SECOND)

    const second = directAndFind(broadcast, REX_STEP_UP)
    expect(second.causeId).toBe(first.id)
    expect(second.depth).toBe(first.depth + 1)
    // 자기 사고를 이으면 이름 없이 사고 명사부터 쓴다
    const { text } = lineOf(broadcast, second)
    expect(text.startsWith(`${eventNoun(first)}에 이어 `)).toBe(true)
    expect(text).not.toContain('렉스의 ')
  })

  it('대상이 된 출연자도 이어받는다', async () => {
    const broadcast = await open()
    run(broadcast, 10)
    // 렉스의 압박은 게스트(오카포)를 대상으로 한다
    const first = directAndFind(broadcast, PRESS_GUEST)
    expect(first.targetId).toBe('okafor')
    run(broadcast, STEPS_PER_SECOND)

    const second = directAndFind(broadcast, OKAFOR_REBUT)
    expect(second.causeId).toBe(first.id)
    expect(second.depth).toBe(first.depth + 1)
    expect(lineOf(broadcast, second).text.startsWith('렉스의 ')).toBe(true)
  })

  it('5초를 넘기면 이어받지 않는다', async () => {
    /** 사고 스텝에서 gap 스텝 뒤(지시 스텝 - 사고 스텝 = gap) 렉스에게 다시 지시한다. */
    async function directAfter(gap: number) {
      const broadcast = await open()
      run(broadcast, 10)
      const first = directAndFind(broadcast, PRESS_GUEST)
      run(broadcast, gap - 1)
      expect(broadcast.currentStep - first.step).toBe(gap)
      const second = directAndFind(broadcast, REX_STEP_UP)
      return { first, second, text: lineOf(broadcast, second).text }
    }

    const late = await directAfter(WINDOW_STEPS + 1)
    expect(late.second.causeId).toBeNull()
    expect(late.second.depth).toBe(1)
    expect(late.text).not.toContain('에 이어 ')

    const justInTime = await directAfter(WINDOW_STEPS)
    expect(justInTime.second.causeId).toBe(justInTime.first.id)
    expect(justInTime.second.depth).toBe(justInTime.first.depth + 1)
  })

  it('광고 뒤에는 이어받지 않는다', async () => {
    const broadcast = await open()
    run(broadcast, 10)
    directAndFind(broadcast, PRESS_GUEST)
    run(broadcast, 10)
    expect(takeoverOf(broadcast, 'rex')).not.toBeNull()

    broadcast.step([{ type: 'ad', effects: ['relief', 'reset'] }])
    broadcast.resumeFromAd()
    expect(broadcast.phase).toBe('live')
    expect(takeoverOf(broadcast, 'rex')).toBeNull()

    const second = directAndFind(broadcast, REX_STEP_UP)
    expect(second.depth).toBe(1)
    expect(lineOf(broadcast, second).text).not.toContain('에 이어 ')
  })

  it('reset 없는 광고 뒤에도 광고 전 사고를 이어받지 않는다', async () => {
    // 광고 효과는 2개를 골라야 하고(relief만·효과 없음은 입력이 될 수 없다), reset이 없는 조합은 이것뿐이다.
    // reset이 없으면 광고 직전 사고가 재개 첫 스텝에 다시 인지된다.
    for (const stepsAfterResume of [0, 1, 2]) {
      const broadcast = await open()
      run(broadcast, 10)
      // 광고 스텝 바로 앞 스텝의 사고는 광고 뒤 재개 첫 스텝에 인지된다
      directAndFind(broadcast, PRESS_GUEST)
      broadcast.step([{ type: 'ad', effects: ['relief', 'setup'] }])
      broadcast.resumeFromAd()
      run(broadcast, stepsAfterResume)
      expect(takeoverOf(broadcast, 'rex'), `재개 뒤 ${stepsAfterResume}스텝`).toBeNull()

      const second = directAndFind(broadcast, REX_STEP_UP)
      expect(second.causeId, `재개 뒤 ${stepsAfterResume}스텝`).toBeNull()
      expect(second.depth).toBe(1)
      expect(lineOf(broadcast, second).text).not.toContain('에 이어 ')
    }
  })

  it('이탈한 출연자는 takeover가 null이다', async () => {
    const broadcast = await open()
    run(broadcast, 10)
    // 오카포는 내성이 낮아(2회) 세 번째 지시에 이탈한다
    for (let i = 0; i < TOLERANCE_COUNT.low; i++) {
      broadcast.step([OKAFOR_REBUT])
      run(broadcast, 10)
    }
    expect(takeoverOf(broadcast, 'okafor')).not.toBeNull()

    broadcast.step([OKAFOR_REBUT])
    run(broadcast, 10)
    const okafor = broadcast.view().actors.find((actor) => actor.id === 'okafor')
    expect(okafor?.walkedOut).toBe(true)
    expect(okafor?.takeover).toBeNull()
  })

  it('view의 takeover가 남은 몸 초를 보인다', async () => {
    const broadcast = await open()
    run(broadcast, 10)
    const first = directAndFind(broadcast, PRESS_GUEST)
    // 인지와 같은 시점에 기억하므로 다음 스텝부터 보인다
    run(broadcast, 1)

    const fresh = takeoverOf(broadcast, 'rex')
    expect(fresh).toMatchObject({ eventId: first.id, text: describeEvent(first, PERFORMER_NAMES) })
    expect(Math.abs((fresh?.remainingBodySeconds ?? 0) - TAKEOVER_BODY_SECONDS)).toBeLessThanOrEqual(
      2 * STEP_SECONDS,
    )

    run(broadcast, 2 * STEPS_PER_SECOND)
    const later = takeoverOf(broadcast, 'rex')
    expect(Math.abs((later?.remainingBodySeconds ?? 0) - (TAKEOVER_BODY_SECONDS - 2))).toBeLessThanOrEqual(
      2 * STEP_SECONDS,
    )

    run(broadcast, WINDOW_STEPS)
    expect(takeoverOf(broadcast, 'rex')).toBeNull()
  })
})

// ── 연루 갱신(순수 함수) ─────────────────────────────────

const perceiver = (id: string, x: number): Perceiver => ({ id, x, y: 1, z: 4, inDarkness: false })

const event = (overrides: Partial<PhenomenonEvent> & { id: number }): PhenomenonEvent => ({
  kind: 'laughter',
  intensity: 1,
  sourceId: 'a',
  targetId: null,
  x: 0,
  y: 1,
  z: 4,
  causeId: null,
  depth: 1,
  step: 30,
  ...overrides,
})

describe('updateInvolvement', () => {
  it('기척은 연루가 아니다', () => {
    const map: InvolvementMap = new Map()
    updateInvolvement(map, [event({ id: 1, intensity: 0, targetId: 'b' })], [
      perceiver('a', 0),
      perceiver('b', 0.5),
    ])
    expect(map.size).toBe(0)
  })

  it('방송 정적은 사고가 아니라 연루가 아니다', () => {
    const map: InvolvementMap = new Map()
    updateInvolvement(map, [event({ id: 1, kind: 'silence', sourceId: 'broadcast' })], [
      perceiver('a', 0),
    ])
    expect(map.size).toBe(0)
  })

  it('낸 출연자, 당한 출연자, 인지한 출연자가 연루되고 멀리 있는 출연자는 아니다', () => {
    const map: InvolvementMap = new Map()
    const laugh = event({ id: 1, targetId: 'b' })
    updateInvolvement(map, [laugh], [
      perceiver('a', 0),
      perceiver('b', 100),
      perceiver('c', 1),
      perceiver('far', 100),
    ])
    expect([...map.keys()].sort()).toEqual(['a', 'b', 'c'])
    expect(map.get('a')).toEqual({ event: laugh, step: laugh.step })
  })

  it('같은 스텝 사고 여러 개면 id가 큰 사고', () => {
    const map: InvolvementMap = new Map()
    const later = event({ id: 5 })
    const earlier = event({ id: 4 })
    updateInvolvement(map, [later, earlier], [perceiver('a', 0)])
    expect(map.get('a')?.event).toBe(later)
  })
})

describe('이어받기 창', () => {
  const entry = { event: event({ id: 1 }), step: 100 }

  it('창 안이면 기억한 사고를, 넘으면 null을 돌려준다', () => {
    expect(activeInvolvement(entry, 100 + 300, 300)).toBe(entry)
    expect(activeInvolvement(entry, 100 + 301, 300)).toBeNull()
    expect(activeInvolvement(undefined, 100, 300)).toBeNull()
  })

  it('남은 스텝은 이번 스텝을 포함해 센다(창 안이면 0 초과)', () => {
    expect(remainingTakeoverSteps(entry, 100 + 300, 300)).toBe(1)
    expect(remainingTakeoverSteps(entry, 100, 300)).toBe(301)
  })

  it('조정값 0이면 창이 0이라 이어받기가 꺼진다', () => {
    expect(takeoverWindowSteps(0, STEPS_PER_SECOND)).toBe(0)
    expect(takeoverWindowSteps(5, STEPS_PER_SECOND)).toBe(5 * STEPS_PER_SECOND)
    expect(activeInvolvement({ event: event({ id: 1 }), step: 100 }, 100, 0)).toBeNull()
  })
})
