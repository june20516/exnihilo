import { describe, expect, it } from 'vitest'
import { COMMON_EMOTION_DEFS } from '@/content/emotions'
import type { ActionDef, BurstAction, EmotionDef, PerformerDef } from '@/content/types'
import { fixtureColor } from '@/test-support/fixtureColor'
import type { CastMember } from './cast'
import type { Reason } from './emotion'
import type { LifeOutput } from './life'
import { LifeActions, type ActionResult, type LineInput } from './lifeActions'
import { EventLog, type PhenomenonEvent } from './phenomena'
import { NO_TARGET } from './targeting'

// 터짐을 언제 할지는 StudioLife의 확률 판정이 정한다. 여기서는 터짐 출력을 직접 넣어
// "터짐 줄의 깊이" 규칙만 본다. 그래서 결과가 난수 흐름에 전혀 기대지 않는다.

const IRRITATION: EmotionDef = COMMON_EMOTION_DEFS[0]
const QUIET_BURST: BurstAction = { line: '몸을 비튼다', action: { pose: 'idle', emits: [] } }

const MO_DEF: PerformerDef = {
  id: 'mo',
  name: '모',
  shortName: '모',
  color: fixtureColor('mo'),
  role: '역할',
  tendency: '성향',
  presence: 1,
  tolerance: 'max',
  weight: 'normal',
  tags: [],
  reactions: [],
  directives: [],
  misfire: 'never',
}

function member(def: PerformerDef): CastMember {
  return {
    def,
    home: { x: 0, z: 0 },
    pose: 'idle',
    walkedOut: false,
    walkoutStep: null,
    departedAt: null,
    motionCause: null,
    motionCauseStep: 0,
    wasOnAir: true,
    absentSteps: 0,
    poseStep: 0,
    walkGoal: null,
  }
}

/** 원인에 이어 분노(강도 1) 하나를 내뿜는 행동. 엔진의 executeAction처럼 원인을 이어 사건을 낸다 */
function emitAngerFrom(log: EventLog) {
  return (
    _member: CastMember,
    _action: ActionDef,
    cause: PhenomenonEvent | null,
  ): ActionResult => ({
    events: [
      log.emit({
        kind: 'anger',
        intensity: 1,
        sourceId: 'mo',
        targetId: 'rex',
        x: 0,
        y: 0,
        z: 0,
        causeId: cause?.id ?? null,
        step: 100,
      }),
    ],
    moveTarget: NO_TARGET,
  })
}

function setup(options: { emitsAnger?: boolean } = {}) {
  const log = new EventLog()
  const lines: LineInput[] = []
  const mo = member(MO_DEF)
  const actions = new LifeActions({
    cast: { get: (id) => (id === 'mo' ? mo : undefined), position: () => ({ x: 0, y: 0, z: 0 }) },
    locator: { targetById: () => NO_TARGET, resolveTarget: () => NO_TARGET },
    log,
    life: { recentHabit: () => null },
    names: { mo: '모', rex: '렉스' },
    currentStep: () => 100,
    emit: () => {
      throw new Error('터짐은 emit을 직접 부르지 않는다')
    },
    addLine: (line) => lines.push(line),
    move: () => NO_TARGET,
    setMotionCause: () => {},
    // 기본은 현상을 내지 않는 행동(사건 없이 끝난다). emitsAnger면 원인에 이어 분노 하나를 낸다
    executeAction: options.emitsAnger
      ? emitAngerFrom(log)
      : () => ({ events: [], moveTarget: NO_TARGET }),
  })
  return { log, lines, actions }
}

function anger(log: EventLog): PhenomenonEvent {
  return log.emit({
    kind: 'anger',
    intensity: 1,
    sourceId: 'rex',
    targetId: 'mo',
    x: 0,
    y: 0,
    z: 0,
    causeId: null,
    step: 10,
  })
}

function quietBurst(cause: PhenomenonEvent | null, top: Reason[] = []): LifeOutput {
  return {
    type: 'burst',
    actorId: 'mo',
    emotion: IRRITATION,
    size: 'small',
    burst: QUIET_BURST,
    intense: false,
    cause,
    top,
  }
}

describe('터짐 줄의 깊이(Ruling 9)', () => {
  it('현상 없는 터짐 줄은 원인 깊이 + 1이다', () => {
    const { log, lines, actions } = setup()
    const cause = anger(log)
    actions.execute(quietBurst(cause))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ kind: 'incident', eventId: null, depth: cause.depth + 1, emotion: 'irritation' })
    expect(lines[0].text).toBe('모가 몸을 비튼다')
  })

  it('원인이 광고 전 사건이면 현상 없는 터짐 줄의 깊이는 1이다', () => {
    const { log, lines, actions } = setup()
    const cause = anger(log)
    log.breakChains()
    actions.execute(quietBurst(cause))
    expect(lines[0]).toMatchObject({ kind: 'incident', eventId: null, depth: 1 })
  })

  it('지시가 이유라 원인 사건이 없는 터짐 줄은 깊이 1이고 "PD의 \'<지시>\'에 <이름>이 …" 꼴이다', () => {
    const { lines, actions } = setup()
    const directive: Reason = {
      emotion: 'irritation',
      amount: 40,
      source: { type: 'directive', label: '참아' },
    }
    actions.execute(quietBurst(null, [directive]))
    expect(lines[0]).toMatchObject({ kind: 'incident', eventId: null, depth: 1, emotion: 'irritation' })
    expect(lines[0].text).toBe("PD의 '참아'에 모가 몸을 비튼다")
  })
})

describe('사건을 내는 터짐의 깊이와 줄(Ruling 9)', () => {
  it('터짐이 내뿜은 사건의 깊이는 원인 깊이 + 1이고, 줄은 그 사건을 가리키며 같은 깊이다', () => {
    const { log, lines, actions } = setup({ emitsAnger: true })
    const cause = anger(log)
    actions.execute(quietBurst(cause))
    const burstEvent = log.since(0).at(-1)
    expect(burstEvent).toMatchObject({ kind: 'anger', causeId: cause.id, depth: cause.depth + 1 })
    expect(lines[0]).toMatchObject({
      kind: 'incident',
      eventId: burstEvent?.id,
      depth: cause.depth + 1,
    })
  })

  it('원인이 광고 전 사건이면 터짐이 내뿜은 사건의 깊이는 1이고, 줄도 같다', () => {
    const { log, lines, actions } = setup({ emitsAnger: true })
    const cause = anger(log)
    log.breakChains()
    actions.execute(quietBurst(cause))
    const burstEvent = log.since(0).at(-1)
    expect(burstEvent).toMatchObject({ kind: 'anger', causeId: cause.id, depth: 1 })
    expect(lines[0]).toMatchObject({ kind: 'incident', eventId: burstEvent?.id, depth: 1 })
  })
})
