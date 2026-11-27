import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
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
    mood: null,
    emotions: [],
    misfireChance: 0,
    takeover: null,
    habit: null,
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
      TALK_SHOW.cameras,
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
      TALK_SHOW.cameras,
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

  it('스태프 카드는 콘텐츠의 역할·성향·예상 결과, 담당 카메라, view의 엇나감 확률을 쓴다', () => {
    const [operator] = interventionTargets(
      { actors: [], staff: [staffView({ misfireChance: 0.15 })] },
      PERFORMERS,
      LINEUP.staff,
      TALK_SHOW.cameras,
    )
    const def = LINEUP.staff[0]
    expect(operator.role).toBe(def.role)
    expect(operator.tendency).toBe(def.tendency)
    expect(operator.directives.map((directive) => directive.expect)).toEqual(
      def.directives.map((directive) => directive.expect),
    )
    expect(operator.cameraLabel).toBe('CAM 2 클로즈업')
    expect(operator.misfireChance).toBe(0.15)
    expect(operator.cost).toBe('스태프 피로 +1')
  })

  it('출연자 카드에는 담당 카메라가 없다', () => {
    const [rex] = interventionTargets(
      { actors: [actor('rex')], staff: [] },
      PERFORMERS,
      [],
      TALK_SHOW.cameras,
    )
    expect(rex.cameraLabel).toBeNull()
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
      TALK_SHOW.cameras,
    )
    expect(options.map((option) => option.target.id)).toEqual(['mo'])
  })

  it('오카포 "진정하세요"의 shifts는 [{ text: "짜증 ▼ 크게", rising: false, color: "#22C55E" }]', () => {
    const [okafor] = interventionTargets(
      { actors: [actor('okafor')], staff: [] },
      PERFORMERS,
      [],
      TALK_SHOW.cameras,
    )
    const calm = okafor.directives.find((directive) => directive.id === 'calmDown')
    expect(calm?.shifts).toEqual([{ text: '짜증 ▼ 크게', rising: false, color: '#22C55E' }])
  })

  it('올리는 변화는 그 감정 색을 쓴다(오카포 짜증 ▲는 짜증 색)', () => {
    const options = interventionTargets(
      { actors: LINEUP.performers.map((performer) => actor(performer.id)), staff: [] },
      PERFORMERS,
      [],
      TALK_SHOW.cameras,
    )
    const rising = options
      .flatMap((option) => option.directives)
      .flatMap((directive) => directive.shifts)
      .filter((shift) => shift.rising)
    expect(rising.length).toBeGreaterThan(0)
    for (const shift of rising) expect(shift.color).not.toBe('#22C55E')
    expect(rising.some((shift) => shift.text.startsWith('짜증') && shift.color === '#EF4444')).toBe(true)
  })

  it('moodShifts가 없는 지시와 스태프 지시는 shifts []이다', () => {
    const noShiftDef: PerformerDef = {
      ...(PERFORMERS.get('rex') as PerformerDef),
      directives: [
        { id: 'plain', label: '가만히', expect: '아무 일 없음', action: { pose: 'idle', emits: [] } },
      ],
    }
    const [fixture] = interventionTargets(
      { actors: [actor('rex')], staff: [] },
      new Map([['rex', noShiftDef]]),
      [],
      TALK_SHOW.cameras,
    )
    expect(fixture.directives[0].shifts).toEqual([])
    const [, operator] = interventionTargets(
      { actors: [actor('rex')], staff: [staffView()] },
      PERFORMERS,
      LINEUP.staff,
      TALK_SHOW.cameras,
    )
    expect(operator.directives.every((directive) => directive.shifts.length === 0)).toBe(true)
  })

  it('색은 출연자만 갖고 스태프는 null이다', () => {
    const [rex, operator] = interventionTargets(
      { actors: [actor('rex')], staff: [staffView()] },
      PERFORMERS,
      LINEUP.staff,
      TALK_SHOW.cameras,
    )
    expect(rex.color).toBe('#EF4444')
    expect(operator.color).toBeNull()
    expect(operator.emotions).toEqual([])
  })

  it('takeover가 있으면 takeoverText = "이 지시는 {text}에 이어집니다 · {올림 초}초", 없으면 null', () => {
    const [plain, taken] = interventionTargets(
      {
        actors: [
          actor('rex'),
          actor('priya', { takeover: { eventId: 1, text: '렉스의 도발', remainingBodySeconds: 2.2 } }),
        ],
        staff: [],
      },
      PERFORMERS,
      [],
      TALK_SHOW.cameras,
    )
    expect(plain.takeoverText).toBeNull()
    expect(taken.takeoverText).toBe('이 지시는 렉스의 도발에 이어집니다 · 3초')
  })
})
