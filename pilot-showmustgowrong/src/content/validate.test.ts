import { describe, expect, it } from 'vitest'
import type { TunableDef } from '@/kit/tuning/tuning'
import { COMMON_EMOTION_DEFS } from './emotions'
import type {
  ActionDef,
  BurstAction,
  BurstDef,
  EmotionDef,
  EquipmentDef,
  HabitDef,
  MindDef,
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
      tracking: true,
    },
  ],
  homeSpots: [
    { x: 4, z: 4 },
    { x: 12, z: 4 },
  ],
  benchSpot: { x: 1, z: 6 },
  exit: { x: 16, z: 4 },
  audienceZone: { minX: 0, maxX: 16, minZ: 8, maxZ: 10 },
  autoCut: { rotation: ['cam1'], incidentCamera: 'cam1', fallbackCamera: 'cam1' },
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

  it('조정 항목 검증 오류가 콘텐츠 검증에 실린다', () => {
    const badTunable: TunableDef = {
      key: 'BAD',
      group: '묶음',
      label: '이름',
      unit: '몸 초',
      defaultValue: 10,
      min: 0,
      max: 5,
      step: 1,
      description: '설명',
    }
    expect(validateShow(show, performers, [makeStaff()], equipment, [badTunable])).toEqual([
      '조정 항목 오류: 기본값이 범위 밖입니다: BAD',
    ])
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
    expect(errorsOf({ showMinutes: Infinity })).toContain('극 중 길이 오류: Infinity분')
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

  it('자동 컷의 없는 카메라와 추적이 아닌 사고 카메라를 보고한다', () => {
    const fixed = { ...show.cameras[0], id: 'cam2', tracking: false }
    const bad = {
      ...show,
      cameras: [show.cameras[0], fixed],
      autoCut: { rotation: ['cam1', 'nope'], incidentCamera: 'cam2', fallbackCamera: 'gone' },
    }
    const errors = validateShow(bad, performers, [makeStaff()], equipment)
    expect(errors).toContain('자동 컷 오류: rotation에 없는 카메라 nope')
    expect(errors).toContain('자동 컷 오류: fallbackCamera에 없는 카메라 gone')
    expect(errors).toContain('자동 컷 오류: incidentCamera cam2가 추적 카메라가 아님')
    const empty = { ...show, autoCut: { ...show.autoCut, rotation: [] } }
    expect(validateShow(empty, performers, [makeStaff()], equipment)).toContain('자동 컷 오류: rotation이 비어 있음')
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

  describe('감정·버릇(mind)', () => {
    const burstAction: BurstAction = { action: idleAction, line: '소리를 지른다' }
    const burst: BurstDef = { small: burstAction, big: burstAction }
    const shy: EmotionDef = {
      id: 'shyness',
      name: '부끄러움',
      stageNames: ['쑥스러움', '얼굴 빨개짐'],
      stageLines: ['쑥스러워한다', '얼굴이 빨개진다'],
      accumulate: '{reasons:에} 움츠린',
    }
    const habitClock: HabitDef = {
      id: 'nose',
      line: '코를 판다',
      recall: '코를 파던',
      noun: '코 파기',
      pose: 'idle',
      weight: 1,
    }
    const habitReply: HabitDef = {
      id: 'laughBack',
      line: '따라 웃는다',
      targetLine: '{target:을} 보며 킥킥댄다',
      recall: '킥킥대던',
      noun: '킥킥',
      pose: 'laugh',
      weight: 1,
      respondsTo: { kinds: ['laughter'], chance: 0.5 },
    }

    function makeMind(overrides: Partial<MindDef> = {}): MindDef {
      const emotions = [...COMMON_EMOTION_DEFS, shy]
      return {
        emotions,
        baseline: { irritation: 10 },
        thresholds: { irritation: { rise: [40, 70], fall: [30, 50], intense: 90 } },
        sensitivities: [
          { emotion: 'irritation', on: 'event', kind: 'noise', scope: 'perceived', amount: 5 },
          {
            emotion: 'boredom',
            on: 'situation',
            situation: { kind: 'offScreen' },
            perShowMinute: 2,
            fadePerShowMinute: 1,
            label: { noun: '무시', clause: '한참 화면에 안 잡힌' },
          },
        ],
        bursts: Object.fromEntries(emotions.map((emotion) => [emotion.id, burst])),
        habits: [habitClock, habitReply],
        ...overrides,
      }
    }

    const errorsFor = (mind: MindDef, extra: Partial<PerformerDef> = {}) =>
      validateShow(
        show,
        [makePerformer('a', { mind, ...extra }), makePerformer('b')],
        [makeStaff()],
        equipment,
      )

    it('정상 mind(공용 4 + 개인 1, 버릇 2개)에는 오류가 없다', () => {
      expect(errorsFor(makeMind())).toEqual([])
    })

    it('1. 공용 감정이 빠지거나 개인 감정이 3개이거나 id가 겹치면 오류', () => {
      const withoutBoredom = makeMind({
        emotions: [...COMMON_EMOTION_DEFS.filter((e) => e.id !== 'boredom'), shy],
      })
      expect(errorsFor(withoutBoredom).join('\n')).toContain('공용 감정 누락 오류: boredom (a)')

      const personal = (id: string): EmotionDef => ({ ...shy, id })
      const three = [...COMMON_EMOTION_DEFS, personal('p1'), personal('p2'), personal('p3')]
      const tooMany = makeMind({
        emotions: three,
        bursts: Object.fromEntries(three.map((e) => [e.id, burst])),
      })
      expect(errorsFor(tooMany).join('\n')).toContain('개인 감정 개수 오류: 3 (a)')

      const duplicated = makeMind({ emotions: [...COMMON_EMOTION_DEFS, shy, shy] })
      expect(errorsFor(duplicated).join('\n')).toContain('중복 감정 오류: shyness (a)')
    })

    it('2. 터짐이 없는 감정과 없는 감정을 가리키는 참조는 오류', () => {
      const noBurst = makeMind()
      delete noBurst.bursts.shyness
      expect(errorsFor(noBurst).join('\n')).toContain('터짐 누락 오류: shyness (a)')

      const ghostBurst = makeMind({ bursts: { ...makeMind().bursts, ghost: burst } })
      expect(errorsFor(ghostBurst).join('\n')).toContain('없는 감정 오류: bursts ghost (a)')

      const ghostSensitivity = makeMind({
        sensitivities: [{ emotion: 'ghost', on: 'event', kind: 'noise', scope: 'perceived', amount: 1 }],
      })
      expect(errorsFor(ghostSensitivity).join('\n')).toContain('없는 감정 오류: sensitivities ghost (a)')

      expect(errorsFor(makeMind({ baseline: { ghost: 5 } })).join('\n')).toContain(
        '없는 감정 오류: baseline ghost (a)',
      )
      expect(
        errorsFor(makeMind({ thresholds: { ghost: { rise: [40, 70], fall: [30, 50], intense: 90 } } })).join('\n'),
      ).toContain('없는 감정 오류: thresholds ghost (a)')
      expect(
        errorsFor(makeMind({ habits: [{ ...habitClock, boost: { emotion: 'ghost', factor: 1 } }] })).join('\n'),
      ).toContain('없는 감정 오류: boost ghost (a)')
      expect(
        errorsFor(
          makeMind({ habits: [{ ...habitClock, when: [{ kind: 'stage', emotion: 'ghost', atLeast: 1 }] }] }),
        ).join('\n'),
      ).toContain('없는 감정 오류: stage ghost (a)')
    })

    it('3. 문턱 순서와 범위가 틀리면 오류', () => {
      const bad = (thresholds: MindDef['thresholds']) => errorsFor(makeMind({ thresholds })).join('\n')
      const message = '문턱 오류:'
      expect(bad({ irritation: { rise: [40, 70], fall: [0, 50], intense: 90 } })).toContain(message)
      expect(bad({ irritation: { rise: [40, 70], fall: [40, 50], intense: 90 } })).toContain(message)
      expect(bad({ irritation: { rise: [40, 101], fall: [30, 50], intense: 100 } })).toContain(message)
      expect(bad({ irritation: { rise: [70, 70], fall: [30, 50], intense: 90 } })).toContain(message)
      expect(bad({ irritation: { rise: [40, 70], fall: [50, 50], intense: 90 } })).toContain(message)
      expect(bad({ irritation: { rise: [40, 70], fall: [30, 50], intense: 60 } })).toContain(message)
      expect(bad({ irritation: { rise: [40, 70], fall: [30, 50], intense: 101 } })).toContain(message)
      expect(bad({ irritation: { rise: [40, 70], fall: [30, 50], intense: 70 } })).toBe('')
    })

    it('4. 민감도 수치와 label이 틀리면 오류', () => {
      const label = { noun: '무시', clause: '화면에 안 잡힌' }
      const situation = { kind: 'offScreen' } as const
      const sens = (extra: Record<string, unknown>) =>
        errorsFor(
          makeMind({
            sensitivities: [
              { emotion: 'boredom', on: 'situation', situation, perShowMinute: 1, label, ...extra },
            ] as MindDef['sensitivities'],
          }),
        ).join('\n')
      expect(
        errorsFor(
          makeMind({
            sensitivities: [{ emotion: 'irritation', on: 'event', kind: 'noise', scope: 'perceived', amount: 0 }],
          }),
        ).join('\n'),
      ).toContain('민감도 오류: amount 0 (a)')
      expect(sens({ perShowMinute: 0 })).toContain('민감도 오류: perShowMinute 0 (a)')
      expect(sens({ fadePerShowMinute: 0 })).toContain('민감도 오류: fadePerShowMinute 0 (a)')
      expect(sens({ label: { noun: ' ', clause: '절' } })).toContain('민감도 오류: label (a)')
      expect(sens({ label: { noun: '명사', clause: '' } })).toContain('민감도 오류: label (a)')
    })

    it('5. 버릇 규칙을 어기면 오류', () => {
      const habits = (list: HabitDef[]) => errorsFor(makeMind({ habits: list })).join('\n')
      expect(habits([])).toContain('버릇 개수 오류: 0 (a)')
      expect(habits([{ ...habitClock, line: ' ' }])).toContain('빈 버릇 문구 오류: line nose (a)')
      expect(habits([{ ...habitClock, recall: '' }])).toContain('빈 버릇 문구 오류: recall nose (a)')
      expect(habits([{ ...habitClock, noun: '' }])).toContain('빈 버릇 문구 오류: noun nose (a)')
      expect(habits([{ ...habitClock, weight: 0 }])).toContain('버릇 가중치 오류: 0 (nose, a)')
      expect(habits([habitClock, { ...habitReply, respondsTo: { kinds: ['laughter'], chance: 0 } }])).toContain(
        '응답 확률 오류: 0 (laughBack, a)',
      )
      expect(habits([habitClock, { ...habitReply, respondsTo: { kinds: ['laughter'], chance: 1.1 } }])).toContain(
        '응답 확률 오류: 1.1 (laughBack, a)',
      )
      expect(habits([habitClock, { ...habitReply, respondsTo: { kinds: [], chance: 0.5 } }])).toContain(
        '응답 종류 오류: laughBack (a)',
      )
      expect(
        habits([{ ...habitClock, stir: { kind: 'noise', target: { tag: 'nope' } } }]),
      ).toContain('알 수 없는 태그: nope (a)')
      expect(
        habits([{ ...habitClock, when: [{ kind: 'nearTag', tag: 'nope', present: true }] }]),
      ).toContain('알 수 없는 태그: nope (a)')
      expect(habits([habitClock, { ...habitClock }])).toContain('중복 버릇 id: nose (a)')
      expect(habits([habitReply])).toContain('버릇 시계 버릇 개수 오류: 0 (a)')
      expect(
        habits([{ ...habitClock, stir: { kind: 'noise', target: { tag: 'tag-b' } } }]),
      ).toBe('')
    })

    it('6. 문형 토큰이 틀리면 오류(출연자 id 포함)', () => {
      const withHabit = (overrides: Partial<HabitDef>) =>
        errorsFor(makeMind({ habits: [habitClock, { ...habitReply, ...overrides }] })).join('\n')
      expect(withHabit({ targetLine: '쳐다보며 킥킥댄다' })).toContain('문형 오류: targetLine에 {target 없음 (a)')
      expect(withHabit({ targetLine: '{who}를 본다' })).toContain('문형 오류: targetLine의 허용되지 않는 토큰 {who} (a)')
      expect(withHabit({ targetLine: '{target:로} 본다' })).toContain(
        '문형 오류: targetLine의 허용되지 않는 토큰 {target:로} (a)',
      )
      expect(withHabit({ targetLine: '{target:에게} 본다' })).toBe('')

      const noReasons = makeMind({ emotions: [{ ...shy, accumulate: '참던' }, ...COMMON_EMOTION_DEFS] })
      expect(errorsFor(noReasons).join('\n')).toContain('문형 오류: accumulate에 {reasons 없음 (a)')
    })

    it('6-1. 터짐 문형(targetLine·intenseLine·small)도 검사한다', () => {
      const withBurst = (small: BurstAction, big: BurstAction = burstAction) => {
        const mind = makeMind()
        mind.bursts.irritation = { small, big }
        return errorsFor(mind).join('\n')
      }
      expect(withBurst(burstAction, { ...burstAction, targetLine: '{target 를 때린다' })).toContain(
        '문형 오류: irritation.big.targetLine의 허용되지 않는 토큰 {target 를 때린다 (a)',
      )
      expect(withBurst(burstAction, { ...burstAction, targetLine: '때린다' })).toContain(
        '문형 오류: irritation.big.targetLine에 {target 없음 (a)',
      )
      expect(withBurst(burstAction, { ...burstAction, intenseLine: '{who}에게 달려든다' })).toContain(
        '문형 오류: irritation.big.intenseLine의 허용되지 않는 토큰 {who} (a)',
      )
      expect(withBurst({ ...burstAction, targetLine: '때린다' })).toContain(
        '문형 오류: irritation.small.targetLine에 {target 없음 (a)',
      )
      expect(withBurst({ ...burstAction, intenseLine: '{target:을} 노려본다' })).toBe('')
    })

    it('6-2. 자리에 맞지 않는 토큰은 오류', () => {
      const habit = (overrides: Partial<HabitDef>) =>
        errorsFor(makeMind({ habits: [{ ...habitClock, ...overrides }] })).join('\n')
      expect(habit({ line: '{target}를 본다' })).toContain('문형 오류: line의 허용되지 않는 토큰 {target} (a)')
      expect(habit({ recall: '{target:을} 보던' })).toContain('문형 오류: recall의 허용되지 않는 토큰 {target:을} (a)')
      expect(habit({ targetLine: '{reasons} 때문에 {target:을} 본다' })).toContain(
        '문형 오류: targetLine의 허용되지 않는 토큰 {reasons} (a)',
      )

      const mind = makeMind()
      mind.bursts.irritation = { small: { ...burstAction, line: '{target}를 친다' }, big: burstAction }
      expect(errorsFor(mind).join('\n')).toContain(
        '문형 오류: irritation.small.line의 허용되지 않는 토큰 {target} (a)',
      )

      const accumulate = (text: string) =>
        errorsFor(makeMind({ emotions: [...COMMON_EMOTION_DEFS, { ...shy, accumulate: text }] })).join('\n')
      expect(accumulate('{reasons}를 참던')).toBe('')
      expect(accumulate('{reasons:을} 참던')).toBe('')
      expect(accumulate('{reasons:와} 참던')).toContain('문형 오류: accumulate의 허용되지 않는 토큰 {reasons:와} (a)')
      expect(accumulate('{reasons:에게} {target} 참던')).toContain(
        '문형 오류: accumulate의 허용되지 않는 토큰 {target} (a)',
      )
    })

    it('6-3. 단계 이름·단계 술어·상황 label·버릇 noun은 토큰 없이 비어 있지 않아야 한다', () => {
      const emotion = (overrides: Partial<EmotionDef>) =>
        errorsFor(makeMind({ emotions: [...COMMON_EMOTION_DEFS, { ...shy, ...overrides }] })).join('\n')
      expect(emotion({ stageNames: ['{target}', '얼굴 빨개짐'] })).toContain(
        '문형 오류: shyness.stageNames[0]의 허용되지 않는 토큰 {target} (a)',
      )
      expect(emotion({ stageNames: ['쑥스러움', ' '] })).toContain('빈 감정 문구 오류: shyness.stageNames[1] (a)')
      expect(emotion({ stageLines: ['{target:을} 피한다', '얼굴이 빨개진다'] })).toContain(
        '문형 오류: shyness.stageLines[0]의 허용되지 않는 토큰 {target:을} (a)',
      )
      expect(emotion({ stageLines: ['쑥스러워한다', ''] })).toContain('빈 감정 문구 오류: shyness.stageLines[1] (a)')

      const label = (overrides: { noun?: string; clause?: string }) =>
        errorsFor(
          makeMind({
            sensitivities: [
              {
                emotion: 'boredom',
                on: 'situation',
                situation: { kind: 'offScreen' },
                perShowMinute: 1,
                label: { noun: '무시', clause: '화면에 안 잡힌', ...overrides },
              },
            ],
          }),
        ).join('\n')
      expect(label({ noun: '{reasons}' })).toContain('문형 오류: label.noun의 허용되지 않는 토큰 {reasons} (a)')
      expect(label({ clause: '{target:에게} 무시당한' })).toContain(
        '문형 오류: label.clause의 허용되지 않는 토큰 {target:에게} (a)',
      )

      const habits = (habit: HabitDef) => errorsFor(makeMind({ habits: [habit] })).join('\n')
      expect(habits({ ...habitClock, noun: '{target}의 코 파기' })).toContain(
        '문형 오류: noun의 허용되지 않는 토큰 {target} (a)',
      )
    })

    it('7. 지시의 moodShifts는 amount가 0이 아니고 지시받는 출연자의 감정만 가리킨다', () => {
      const directive = (moodShifts: { emotion: string; amount: number }[]) => ({
        id: 'd1',
        label: '지시',
        expect: '예상',
        action: idleAction,
        moodShifts,
      })
      const errors = (moodShifts: { emotion: string; amount: number }[], mind?: MindDef) =>
        errorsFor(mind ?? makeMind(), { directives: [directive(moodShifts)] }).join('\n')
      expect(errors([{ emotion: 'shyness', amount: 5 }])).toBe('')
      expect(errors([{ emotion: 'irritation', amount: 0 }])).toContain('감정 변화 오류: amount 0 (d1, a)')
      expect(errors([{ emotion: 'ghost', amount: 5 }])).toContain('없는 감정 오류: moodShifts ghost (a)')

      const noPersonal = makeMind({ emotions: [...COMMON_EMOTION_DEFS] })
      delete noPersonal.bursts.shyness
      expect(errors([{ emotion: 'shyness', amount: 5 }], noPersonal)).toContain(
        '없는 감정 오류: moodShifts shyness (a)',
      )

      // mind 없는 출연자는 공용 4개 id로만 검사한다
      const noMind = (moodShifts: { emotion: string; amount: number }[]) =>
        validateShow(
          show,
          [makePerformer('a', { directives: [directive(moodShifts)] }), makePerformer('b')],
          [makeStaff()],
          equipment,
        ).join('\n')
      expect(noMind([{ emotion: 'boredom', amount: 5 }])).toBe('')
      expect(noMind([{ emotion: 'shyness', amount: 5 }])).toContain('없는 감정 오류: moodShifts shyness (a)')
    })
  })
})
