import { LINEUP } from '@/content/lineup'
import type { PerformerDef } from '@/content/types'
import type { ActorView } from '@/sim/engineTypes'
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
    angle: 0,
    pose: 'idle',
    onAir: false,
    walkedOut: false,
    departed: false,
    directivesLeft: 3,
    ...overrides,
  }
}

describe('interventionTargets', () => {
  it('무대의 출연자와 스태프를 지시와 함께 돌려준다', () => {
    const options = interventionTargets([actor('rex')], PERFORMERS, LINEUP.staff)
    expect(options.map((option) => option.target)).toEqual([
      { kind: 'performer', id: 'rex' },
      { kind: 'staff', id: 'cameraOperator' },
    ])
    expect(options[0].directives[0].input).toEqual({
      type: 'direct',
      actorId: 'rex',
      directiveId: 'stepUp',
    })
    expect(options[0].directivesLeft).toBe(3)
    expect(options[1].directives[0].input.type).toBe('directStaff')
    expect(options[1].directivesLeft).toBeNull()
  })

  it('이탈했거나 출구로 걸어가는 출연자는 목록에 없다', () => {
    const options = interventionTargets(
      [
        actor('rex', { walkedOut: true }),
        actor('priya', { walkedOut: true, departed: true }),
        actor('mo'),
      ],
      PERFORMERS,
      [],
    )
    expect(options.map((option) => option.target.id)).toEqual(['mo'])
  })
})
