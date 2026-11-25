import { describe, expect, it } from 'vitest'
import type {
  ActionDef,
  EquipmentDef,
  PerformerDef,
  ReactionDef,
  ShowDef,
  StaffDef,
} from './types'
import { validateShow } from './validate'

const idleAction: ActionDef = { pose: 'idle', emits: [] }

function makePerformer(id: string, overrides: Partial<PerformerDef> = {}): PerformerDef {
  return {
    id,
    name: `이름 ${id}`,
    shortName: id,
    presence: 1,
    tolerance: 'normal',
    weight: 'normal',
    tags: [`tag-${id}`],
    reactions: [],
    directives: [],
    misfire: 'never',
    ...overrides,
  }
}

function makeStaff(overrides: Partial<StaffDef> = {}): StaffDef {
  return {
    id: 'staff1',
    name: '카메라 감독',
    shortName: '감독',
    cameraId: 'cam1',
    reactions: [],
    directives: [],
    ...overrides,
  }
}

const show: ShowDef = {
  id: 'show1',
  name: '테스트 쇼',
  rating: 'TV-14',
  corners: [
    { label: '코너1', startTag: 'tag-a' },
    { label: '코너2', startTag: 'tag-b' },
    { label: '코너3', startTag: 'tag-a' },
  ],
  cameras: [
    {
      id: 'cam1',
      label: '1번 카메라',
      position: { x: 8, y: 2 },
      defaultAngle: 0,
      fovDegrees: 60,
      range: 12,
      shotIntensity: 1,
    },
  ],
  homeSpots: [{ x: 4 }, { x: 12 }],
  benchSpot: { x: 1 },
  exitX: -1,
  audienceZone: { minX: 0, maxX: 16 },
}

const equipment: EquipmentDef[] = [
  {
    id: 'light1',
    name: '조명',
    kind: 'hangingLight',
    position: { x: 8, y: 7 },
    breakAt: 2,
    onBreak: [{ kind: 'noise', intensity: 2, target: 'none' }],
  },
]

function reactionWith(overrides: Partial<ReactionDef>): ReactionDef {
  return {
    trigger: { kind: 'noise', min: 1, scope: 'perceived' },
    action: idleAction,
    ...overrides,
  }
}

describe('validateShow', () => {
  const performers = [makePerformer('a'), makePerformer('b')]

  it('유효한 픽스처에는 빈 배열을 돌려준다', () => {
    expect(validateShow(show, performers, [makeStaff()], equipment)).toEqual([])
  })

  it('어떤 출연자 태그에도 없는 대상 태그를 보고한다', () => {
    const withBadTarget = [
      makePerformer('a', {
        reactions: [
          reactionWith({
            action: {
              pose: 'idle',
              emits: [{ kind: 'noise', intensity: 1, target: { tag: 'nope' } }],
            },
          }),
        ],
      }),
      makePerformer('b'),
    ]
    const errors = validateShow(show, withBadTarget, [makeStaff()], equipment)
    expect(errors.join('\n')).toContain('알 수 없는 태그: nope')
  })

  it('이동 대상과 스태프 반응 안의 알 수 없는 태그도 보고한다', () => {
    const staffWithBadMove = makeStaff({
      reactions: [
        reactionWith({
          action: {
            pose: 'idle',
            move: { type: 'dash', toward: { tag: 'ghost' }, speed: 3 },
            emits: [],
          },
        }),
      ],
    })
    const errors = validateShow(show, performers, [staffWithBadMove], equipment)
    expect(errors.join('\n')).toContain('알 수 없는 태그: ghost')
  })

  it('쇼 카메라에 없는 스태프 cameraId를 보고한다', () => {
    const errors = validateShow(show, performers, [makeStaff({ cameraId: 'cam9' })], equipment)
    expect(errors.join('\n')).toContain('알 수 없는 카메라: cam9')
  })

  it.each([0, -0.5, 1.5])('chance %s는 확률 범위 오류다', (chance) => {
    const withChance = [
      makePerformer('a', { reactions: [reactionWith({ chance })] }),
      makePerformer('b'),
    ]
    const errors = validateShow(show, withChance, [makeStaff()], equipment)
    expect(errors.join('\n')).toContain('확률 범위 오류')
  })

  it('chance 1은 허용한다', () => {
    const withChance = [
      makePerformer('a', { reactions: [reactionWith({ chance: 1 })] }),
      makePerformer('b'),
    ]
    expect(validateShow(show, withChance, [makeStaff()], equipment)).toEqual([])
  })

  it('출연자 id가 겹치면 중복 id를 보고한다', () => {
    const duplicated = [makePerformer('a'), makePerformer('a')]
    const errors = validateShow(show, duplicated, [makeStaff()], equipment)
    expect(errors.join('\n')).toContain('중복 id')
  })
})
