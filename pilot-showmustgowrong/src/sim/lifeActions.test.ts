import { describe, expect, it } from 'vitest'
import { COMMON_EMOTION_DEFS } from '@/content/emotions'
import type { BurstAction, EmotionDef, PerformerDef } from '@/content/types'
import type { CastMember } from './cast'
import type { LifeOutput } from './life'
import { LifeActions, type LineInput } from './lifeActions'
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

function setup() {
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
      throw new Error('현상 없는 터짐은 emit하지 않는다')
    },
    addLine: (line) => lines.push(line),
    move: () => NO_TARGET,
    setMotionCause: () => {},
    // 현상을 내지 않는 행동: 사건 없이 끝난다
    executeAction: () => ({ events: [], moveTarget: NO_TARGET }),
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

function quietBurst(cause: PhenomenonEvent): LifeOutput {
  return {
    type: 'burst',
    actorId: 'mo',
    emotion: IRRITATION,
    size: 'small',
    burst: QUIET_BURST,
    intense: false,
    cause,
    top: [],
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
})
