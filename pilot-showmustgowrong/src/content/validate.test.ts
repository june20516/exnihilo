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
    role: '역할',
    tendency: '성향',
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
    role: '카메라 감독',
    tendency: '성향',
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
  showMinutes: 30,
  startTime: { hour: 21, minute: 0 },
  traits: [],
  corners: [
    { label: '코너1', startTag: 'tag-a' },
    { label: '코너2', startTag: 'tag-b' },
    { label: '코너3', startTag: 'tag-a' },
  ],
  cameras: [
    {
      id: 'cam1',
      label: '1번 카메라',
      position: { x: 8, y: 2, z: 9 },
      defaultAngle: -90,
      fovDegrees: 60,
      range: 12,
      shotIntensity: 1,
    },
  ],
  homeSpots: [
    { x: 4, z: 4 },
    { x: 12, z: 4 },
  ],
  benchSpot: { x: 1, z: 6 },
  exit: { x: 16, z: 4 },
  audienceZone: { minX: 0, maxX: 16, minZ: 8, maxZ: 10 },
}

const equipment: EquipmentDef[] = [
  {
    id: 'light1',
    name: '조명',
    kind: 'hangingLight',
    position: { x: 8, y: 7, z: 5 },
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

  it('극 중 길이가 0 이하이거나 시작 시각이 범위 밖이면 오류', () => {
    const errorsOf = (overrides: Partial<ShowDef>) =>
      validateShow(
        { ...show, ...overrides },
        [makePerformer('a'), makePerformer('b')],
        [makeStaff()],
        equipment,
      ).join('\n')
    expect(errorsOf({ showMinutes: 0 })).toContain('극 중 길이 오류: 0분')
    expect(errorsOf({ startTime: { hour: 24, minute: 0 } })).toContain('시작 시각 오류: 24:00')
    expect(errorsOf({ startTime: { hour: 21, minute: 60 } })).toContain('시작 시각 오류: 21:60')
    expect(errorsOf({ traits: ['talk', ''] })).toContain('빈 속성 태그')
    expect(errorsOf({})).toBe('')
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

  it('한 카메라를 두 스태프가 맡으면 보고한다', () => {
    const errors = validateShow(
      show,
      performers,
      [makeStaff(), makeStaff({ id: 'staff2' })],
      equipment,
    )
    expect(errors.join('\n')).toContain('한 카메라를 두 스태프가 맡음: cam1 (staff2)')
  })

  it.each([
    { holdSeconds: -1, returnSeconds: 2 },
    { holdSeconds: 1, returnSeconds: 0 },
  ])('스태프 복구 시간 %o는 범위 오류다', (recovery) => {
    const errors = validateShow(show, performers, [makeStaff({ recovery })], equipment)
    expect(errors.join('\n')).toContain('복구 시간 범위 오류')
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

  it.each([
    ['role', { role: ' ' }, '빈 역할: a'],
    ['tendency', { tendency: '' }, '빈 성향: a'],
  ])('출연자의 %s가 비어 있으면 오류다', (_name, overrides, message) => {
    const errors = validateShow(show, [makePerformer('a', overrides)], [makeStaff()], equipment)
    expect(errors).toContain(message)
  })

  it.each([
    ['role', { role: '' }, '빈 역할: staff1'],
    ['tendency', { tendency: ' ' }, '빈 성향: staff1'],
    [
      'directive expect',
      { directives: [{ id: 's1', label: '지시', expect: '', aim: 'default' as const }] },
      '빈 예상 결과: s1 (staff1)',
    ],
  ])('스태프의 %s가 비어 있으면 오류다', (_name, overrides, message) => {
    const errors = validateShow(show, [makePerformer('a')], [makeStaff(overrides)], equipment)
    expect(errors).toContain(message)
  })

  it('지시의 expect가 비어 있으면 오류다', () => {
    const blank = makePerformer('a', {
      directives: [{ id: 'd1', label: '지시', expect: '', action: idleAction }],
    })
    const errors = validateShow(show, [blank], [makeStaff()], equipment)
    expect(errors).toContain('빈 예상 결과: d1 (a)')
  })

  it('지시 안의 알 수 없는 태그를 보고한다', () => {
    const withDirective = [
      makePerformer('a', {
        directives: [
          {
            id: 'd1',
            label: '지시',
            expect: '소음 1',
            action: {
              pose: 'idle',
              emits: [{ kind: 'noise', intensity: 1, target: { tag: 'dir-ghost' } }],
            },
          },
        ],
      }),
    ]
    const errors = validateShow(show, withDirective, [makeStaff()], equipment)
    expect(errors.join('\n')).toContain('알 수 없는 태그: dir-ghost')
  })

  it('장비 onBreak 안의 알 수 없는 태그를 보고한다', () => {
    const badEquipment: EquipmentDef[] = [
      { ...equipment[0], onBreak: [{ kind: 'noise', intensity: 1, target: { tag: 'eq-ghost' } }] },
    ]
    const errors = validateShow(show, performers, [makeStaff()], badEquipment)
    expect(errors.join('\n')).toContain('알 수 없는 태그: eq-ghost')
  })

  it('스태프 중복 id를 보고한다', () => {
    const errors = validateShow(show, performers, [makeStaff(), makeStaff()], equipment)
    expect(errors.join('\n')).toContain('중복 id: 스태프 staff1')
  })

  it('장비 중복 id를 보고한다', () => {
    const errors = validateShow(show, performers, [makeStaff()], [equipment[0], equipment[0]])
    expect(errors.join('\n')).toContain('중복 id: 장비 light1')
  })

  it('카메라 중복 id를 보고한다', () => {
    const dupShow = { ...show, cameras: [show.cameras[0], show.cameras[0]] }
    const errors = validateShow(dupShow, performers, [makeStaff()], equipment)
    expect(errors.join('\n')).toContain('중복 id: 카메라 cam1')
  })

  it('엔진이 고정 환경 source로 쓰는 예약 id(audience, broadcast)를 보고한다', () => {
    const reservedShow = {
      ...show,
      cameras: [show.cameras[0], { ...show.cameras[0], id: 'audience' }],
    }
    const errors = validateShow(
      reservedShow,
      [makePerformer('broadcast'), makePerformer('b')],
      [makeStaff()],
      equipment,
    )
    expect(errors).toContain('예약된 id: 카메라 audience')
    expect(errors).toContain('예약된 id: 출연자 broadcast')
  })

  it('출연자가 없는 코너 startTag와 corner 트리거 태그는 허용한다', () => {
    const noTagShow = {
      ...show,
      corners: [
        { label: 'c1', startTag: 'absent' },
        { label: 'c2', startTag: 'tag-a' },
        { label: 'c3', startTag: 'tag-a' },
      ] as ShowDef['corners'],
    }
    const withCorner = [
      makePerformer('a', {
        reactions: [reactionWith({ trigger: { kind: 'corner', tag: 'other-lineup' } })],
      }),
    ]
    expect(validateShow(noTagShow, withCorner, [makeStaff()], equipment)).toEqual([])
  })

  describe('스튜디오 밖 좌표', () => {
    it.each([
      { x: -0.1, z: 4 },
      { x: 16.1, z: 4 },
      { x: 4, z: -0.1 },
      { x: 4, z: 10.1 },
    ])('home spot (%o)는 오류다', (spot) => {
      const outside = { ...show, homeSpots: [show.homeSpots[0], spot] }
      const errors = validateShow(outside, performers, [makeStaff()], equipment)
      expect(errors.join('\n')).toContain('스튜디오 밖 좌표: home spot 2')
    })

    it.each([
      { x: 17, y: 7, z: 5 },
      { x: 8, y: 7, z: 11 },
    ])('장비 (%o)는 오류다', (position) => {
      const errors = validateShow(show, performers, [makeStaff()], [{ ...equipment[0], position }])
      expect(errors.join('\n')).toContain('스튜디오 밖 좌표: 장비 light1')
    })

    it.each([
      { x: -1, y: 2, z: 9 },
      { x: 8, y: 2, z: 10.5 },
    ])('카메라 (%o)는 오류다', (position) => {
      const outside = { ...show, cameras: [{ ...show.cameras[0], position }] }
      const errors = validateShow(outside, performers, [makeStaff()], equipment)
      expect(errors.join('\n')).toContain('스튜디오 밖 좌표: 카메라 cam1')
    })

    it('exit도 스튜디오 밖이면 오류다', () => {
      const outside = { ...show, exit: { x: 16.5, z: 4 } }
      const errors = validateShow(outside, performers, [makeStaff()], equipment)
      expect(errors.join('\n')).toContain('스튜디오 밖 좌표: exit')
    })

    it('경계 위(x 0·16, z 0·10)는 허용한다', () => {
      const edge = {
        ...show,
        homeSpots: [
          { x: 0, z: 0 },
          { x: 16, z: 10 },
        ],
      }
      expect(validateShow(edge, performers, [makeStaff()], equipment)).toEqual([])
    })
  })
})
