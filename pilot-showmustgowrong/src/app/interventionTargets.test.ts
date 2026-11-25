import { LINEUP } from '@/content/lineup'
import type { PerformerDef } from '@/content/types'
import type { ActorView, StaffView } from '@/sim/engineTypes'
import { interventionTargets } from './interventionTargets'

const PERFORMERS = new Map<string, PerformerDef>(
  [...LINEUP.performers, ...LINEUP.bench].map((performer) => [performer.id, performer]),
)

function actor(id: string, overrides: Partial<ActorView> = {}): ActorView {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    z: 0,
    up: { x: 0, y: 1, z: 0 },
    pose: 'idle',
    onAir: false,
    walkedOut: false,
    departed: false,
    directivesLeft: 3,
    tension: 0,
    aboutToBurst: false,
    misfireChance: 0,
    ...overrides,
  }
}

function staffView(overrides: Partial<StaffView> = {}): StaffView {
  return {
    id: 'cameraOperator',
    name: '겁쟁이 카메라 감독',
    cameraId: 'close',
    mode: 'normal',
    recoveryProgress: 1,
    misfireChance: 0,
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  }
}

describe('interventionTargets', () => {
  it('무대의 출연자와 스태프를 지시와 함께 돌려준다', () => {
    const options = interventionTargets(
      { actors: [actor('rex')], staff: [staffView()] },
      PERFORMERS,
      LINEUP.staff,
    )
    expect(options.map((option) => option.target)).toEqual([
      { kind: 'performer', id: 'rex' },
      { kind: 'staff', id: 'cameraOperator' },
    ])
    expect(options[0].directives[0].input).toEqual({
      type: 'direct',
      actorId: 'rex',
      directiveId: 'stepUp',
    })
    expect(options[0].toleranceLeft).toBe(3)
    expect(options[1].directives[0].input.type).toBe('directStaff')
    expect(options[1].toleranceLeft).toBeNull()
  })

  it('출연자 카드 정보는 콘텐츠와 view에서 채운다', () => {
    const [rex] = interventionTargets(
      { actors: [actor('rex', { misfireChance: 0.3, directivesLeft: 4 })], staff: [] },
      PERFORMERS,
      [],
    )
    const def = PERFORMERS.get('rex')
    expect(rex.role).toBe(def?.role)
    expect(rex.tendency).toBe(def?.tendency)
    expect(rex.presence).toBe(def?.presence)
    expect(rex.weight).toBe(def?.weight)
    expect(rex.toleranceLeft).toBe(4)
    expect(rex.misfireChance).toBe(0.3)
    expect(rex.cost).toBe('내성 1 소모 · 누적 피로 +1')
    expect(rex.directives.map((directive) => directive.expect)).toEqual(
      def?.directives.map((directive) => directive.expect),
    )
  })

  it('스태프 카드는 view의 엇나감 확률과 스태프 피로 비용을 쓴다', () => {
    const [operator] = interventionTargets(
      { actors: [], staff: [staffView({ misfireChance: 0.15 })] },
      PERFORMERS,
      LINEUP.staff,
    )
    expect(operator.misfireChance).toBe(0.15)
    expect(operator.cost).toBe('스태프 피로 +1')
    expect(operator.tendency.length).toBeGreaterThan(0)
    for (const directive of operator.directives) expect(directive.expect.length).toBeGreaterThan(0)
  })

  it('이탈했거나 출구로 걸어가는 출연자는 목록에 없다', () => {
    const options = interventionTargets(
      {
        actors: [
          actor('rex', { walkedOut: true }),
          actor('priya', { walkedOut: true, departed: true }),
          actor('mo'),
        ],
        staff: [],
      },
      PERFORMERS,
      [],
    )
    expect(options.map((option) => option.target.id)).toEqual(['mo'])
  })
})
