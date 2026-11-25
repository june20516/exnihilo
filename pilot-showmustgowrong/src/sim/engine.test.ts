import { afterEach, describe, expect, it } from 'vitest'
import { AD_GAUGE_RELIEF, CORNER_STEPS, STEP_SECONDS } from '@/content/balance'
import type {
  ActionDef,
  DirectiveDef,
  EquipmentDef,
  PerformerDef,
  ReactionDef,
  ShowDef,
  StaffDef,
} from '@/content/types'
import { Broadcast, replay, type BroadcastInput, type BroadcastSetup } from './engine'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)

const SHOW: ShowDef = {
  id: 'test',
  name: '테스트 쇼',
  rating: 'TV-14',
  corners: [
    { label: '오프닝', startTag: 'host' },
    { label: '토크', startTag: 'guest' },
    { label: '게임', startTag: 'host' },
  ],
  cameras: [
    // 무대 전체와 스튜디오 가운데를 잡는다
    { id: 'wide', label: '와이드', position: { x: 8, y: 8 }, defaultAngle: -90, fovDegrees: 140, range: 12, shotIntensity: 1 },
    { id: 'close', label: '클로즈업', position: { x: 2, y: 1 }, defaultAngle: 0, fovDegrees: 30, range: 6, shotIntensity: 2 },
    // 무대의 누구도 잡지 않는다
    { id: 'audience', label: '관객석', position: { x: 1.5, y: 4 }, defaultAngle: -90, fovDegrees: 40, range: 3, shotIntensity: 1 },
  ],
  homeSpots: [{ x: 4 }, { x: 6.5 }, { x: 9.5 }, { x: 12 }],
  benchSpot: { x: 15 },
  exitX: 15.8,
  audienceZone: { minX: 0, maxX: 3 },
}

const directive = (id: string, action: ActionDef): DirectiveDef => ({ id, label: id, action })

const CALM = directive('calm', { pose: 'idle', emits: [] })
const SHOUT = directive('shout', {
  pose: 'angry',
  move: { type: 'dash', toward: 'nearestPerformer', speed: 6 },
  emits: [{ kind: 'anger', intensity: 2, target: 'nearestPerformer' }],
})
const CHARGE = directive('charge', {
  pose: 'angry',
  move: { type: 'leap', toward: { tag: 'host' }, speed: 8 },
  emits: [{ kind: 'noise', intensity: 1, target: { tag: 'host' } }],
})

const performer = (overrides: Partial<PerformerDef> & { id: string }): PerformerDef => ({
  name: overrides.id,
  shortName: overrides.id,
  presence: 1,
  tolerance: 'max',
  weight: 'normal',
  tags: [],
  reactions: [],
  directives: [CALM],
  misfire: 'never',
  ...overrides,
})

const cornerNoise = (tag: string): ReactionDef => ({
  trigger: { kind: 'corner', tag },
  action: { pose: 'idle', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
})

const REX = performer({
  id: 'rex',
  name: '렉스 캘러웨이',
  shortName: '렉스',
  presence: 2,
  tolerance: 'normal',
  misfire: 'overdo',
  tags: ['host'],
  reactions: [cornerNoise('host')],
  directives: [CALM, SHOUT],
})

const MO = performer({
  id: 'mo',
  name: '모 타비타',
  shortName: '모',
  weight: 'heavy',
  tags: ['guest'],
  reactions: [
    cornerNoise('guest'),
    {
      trigger: { kind: 'anger', min: 1, scope: 'perceived' },
      action: {
        pose: 'angry',
        move: { type: 'leap', toward: 'cause', speed: 8 },
        emits: [{ kind: 'anger', intensity: 'causePlusOne', target: 'cause' }],
      },
    },
  ],
  directives: [CALM, CHARGE],
})

const JUNE = performer({ id: 'june', name: '준 휘태커', shortName: '준', tags: ['guest'] })

const CAMERA_OPERATOR: StaffDef = {
  id: 'cammy',
  name: '겁쟁이 카메라 감독',
  shortName: '카메라 감독',
  cameraId: 'close',
  reactions: [
    { trigger: { kind: 'noise', min: 2, scope: 'perceived' }, action: { pose: 'panic', emits: [] } },
  ],
  directives: [
    { id: 'audience', label: '관객석 비춰 주세요', aim: 'audience' },
    { id: 'calm', label: '침착하세요', aim: 'default' },
  ],
}

const LIGHT: EquipmentDef = {
  id: 'light',
  name: '과열된 조명',
  kind: 'hangingLight',
  position: { x: 8, y: 6 },
  breakAt: 2,
  onBreak: [
    { kind: 'impact', intensity: 3, target: 'none' },
    { kind: 'noise', intensity: 3, target: 'none' },
  ],
  darknessZone: { minX: 6, maxX: 10 },
}

const setup = (overrides: Partial<BroadcastSetup> = {}): BroadcastSetup => ({
  show: SHOW,
  performers: [REX, MO],
  bench: [JUNE],
  staff: [CAMERA_OPERATOR],
  equipment: [LIGHT],
  seed: 7,
  ...overrides,
})

/** 반응이 하나도 없는 조용한 무대 */
const quietSetup = (overrides: Partial<BroadcastSetup> = {}): BroadcastSetup =>
  setup({
    performers: [performer({ id: 'rex', shortName: '렉스', tags: ['host'] }), performer({ id: 'mo', shortName: '모', tags: ['guest'] })],
    staff: [],
    equipment: [],
    ...overrides,
  })

const opened: Broadcast[] = []

async function open(broadcastSetup: BroadcastSetup): Promise<Broadcast> {
  const broadcast = await Broadcast.create(broadcastSetup)
  opened.push(broadcast)
  return broadcast
}

afterEach(() => {
  for (const broadcast of opened.splice(0)) broadcast.dispose()
})

/** steps 스텝을 끝까지 돌린다. 광고로 멈춘 스텝은 입력 없이 다시 돈다. */
function run(broadcast: Broadcast, steps: number, inputs: Map<number, BroadcastInput[]> = new Map()) {
  const target = broadcast.currentStep + steps
  let fedStep = -1
  while (broadcast.currentStep < target && broadcast.phase !== 'ended') {
    const step = broadcast.currentStep
    broadcast.step(step === fedStep ? [] : (inputs.get(step) ?? []))
    fedStep = step
    if (broadcast.phase === 'adBreak') broadcast.resumeFromAd()
  }
}

describe('Broadcast.create', () => {
  it('콘텐츠 검증 오류가 있으면 그 목록으로 throw한다', async () => {
    const broken = performer({
      id: 'broken',
      directives: [directive('x', { pose: 'idle', emits: [{ kind: 'noise', intensity: 1, target: { tag: 'nobody' } }] })],
    })
    await expect(Broadcast.create(setup({ performers: [REX, broken] }))).rejects.toThrow(
      '알 수 없는 태그: nobody',
    )
  })

  it('출연자를 home spot에, 카메라를 기본 각도로 둔다', async () => {
    const view = (await open(setup())).view()
    expect(view.step).toBe(0)
    expect(view.phase).toBe('live')
    expect(view.onAirCameraId).toBe('wide')
    expect(view.cameraAngles).toEqual({ wide: -90, close: 0, audience: -90 })
    expect(view.actors.map((actor) => [actor.id, actor.x])).toEqual([
      ['rex', 4],
      ['mo', 6.5],
    ])
    expect(view.actors[0]).toMatchObject({ name: '렉스 캘러웨이', pose: 'idle', onAir: true, walkedOut: false, directivesLeft: 3 })
    expect(view.equipment).toEqual([{ id: 'light', x: 8, y: 6, angle: 0, released: false }])
    expect(view.limits).toEqual({ sexual: 70, violence: 70, drugs: 60, language: 50 })
  })
})

describe('결정론', () => {
  const INPUTS = new Map<number, BroadcastInput[]>([
    [30, [{ type: 'switch', cameraId: 'close' }]],
    [60, [{ type: 'direct', actorId: 'rex', directiveId: 'shout' }]],
    [120, [{ type: 'directStaff', staffId: 'cammy', directiveId: 'audience' }]],
    [200, [{ type: 'switch', cameraId: 'wide' }]],
    [400, [{ type: 'direct', actorId: 'mo', directiveId: 'charge' }]],
    [900, [{ type: 'direct', actorId: 'rex', directiveId: 'shout' }, { type: 'direct', actorId: 'rex', directiveId: 'shout' }]],
    [1500, [{ type: 'ad', effects: ['relief', 'reset'] }]],
    [1800, [{ type: 'direct', actorId: 'mo', directiveId: 'charge' }]],
  ])

  it('같은 setup과 입력이면 3000 스텝 뒤 view가 같고 replay도 같다', async () => {
    const first = await open(setup())
    const second = await open(setup())
    run(first, 3000, INPUTS)
    run(second, 3000, INPUTS)

    const view = first.view()
    expect(view.step).toBe(3000)
    expect(second.view()).toEqual(view)
    expect(first.events().length).toBeGreaterThan(5)
    expect(await replay(setup(), first.inputLog(), 3000)).toEqual(view)
  })
})

describe('코너', () => {
  it('코너 시작 스텝에 startTag 출연자의 corner 반응이 실행되어 로그가 한 줄 생긴다', async () => {
    const broadcast = await open(setup())
    broadcast.step([])
    expect(broadcast.view().log).toEqual([
      expect.objectContaining({ step: 0, text: '렉스 쪽에서 소리가 난다', depth: 1 }),
    ])
    expect(broadcast.view().cornerIndex).toBe(0)

    run(broadcast, CORNER_STEPS)
    const view = broadcast.view()
    expect(view.cornerIndex).toBe(1)
    expect(view.log.filter((line) => line.step === CORNER_STEPS)).toEqual([
      expect.objectContaining({ text: '모 쪽에서 소리가 난다', depth: 1 }),
    ])
  })
})

describe('정적', () => {
  it('아무 일도 없으면 5초 뒤 silence 강도 1 이벤트가 생긴다', async () => {
    const broadcast = await open(quietSetup())
    run(broadcast, 5 * STEPS_PER_SECOND - 1)
    expect(broadcast.events().filter((event) => event.kind === 'silence')).toEqual([])

    run(broadcast, 1)
    const silences = broadcast.events().filter((event) => event.kind === 'silence')
    expect(silences).toEqual([expect.objectContaining({ intensity: 1, sourceId: 'broadcast', step: 5 * STEPS_PER_SECOND - 1 })])
    expect(broadcast.view().log.at(-1)?.text).toBe('방송에 정적이 흐른다…')
  })

  it('정적이 이어지면 10초, 15초에 강도 2, 3이 나오고 시청자가 줄어든다', async () => {
    const broadcast = await open(quietSetup())
    const start = broadcast.view().viewers
    run(broadcast, 15 * STEPS_PER_SECOND)
    const intensities = broadcast.events().filter((event) => event.kind === 'silence').map((event) => event.intensity)
    expect(intensities).toEqual([1, 2, 3])
    expect(broadcast.view().viewers).toBeLessThan(start)
  })
})

describe('수위 초과', () => {
  const OVERBOARD = directive('overboard', {
    pose: 'angry',
    emits: [
      { kind: 'exposure', intensity: 3, target: 'self' },
      { kind: 'exposure', intensity: 3, target: 'self' },
      { kind: 'anger', intensity: 3, target: 'none' },
      { kind: 'anger', intensity: 3, target: 'none' },
      { kind: 'anger', intensity: 3, target: 'none' },
    ],
  })

  it('개입으로 두 게이지가 같은 스텝에 상한을 넘으면 그 스텝에 끝나고 앞선 게이지가 원인이다', async () => {
    const show: ShowDef = { ...SHOW, rating: 'TV-PG' }
    const wild = performer({ id: 'rex', shortName: '렉스', tags: ['host'], directives: [OVERBOARD] })
    const broadcast = await open(quietSetup({ show, performers: [wild, MO] }))
    run(broadcast, 10)

    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'overboard' }])
    const view = broadcast.view()
    expect(view.step).toBe(11)
    expect(view.phase).toBe('ended')
    expect(view.haltedBy).toBe('sexual')
    expect(view.gauges.language).toBeGreaterThanOrEqual(view.limits.language)

    broadcast.step([{ type: 'switch', cameraId: 'close' }])
    expect(broadcast.view()).toEqual(view)
  })

  it('강도 3 송출과 상한 80% 도달은 자동 슬로모션을 건다(같은 게이지는 한 번)', async () => {
    const tease = directive('tease', {
      pose: 'laugh',
      emits: [{ kind: 'exposure', intensity: 2, target: 'self' }, { kind: 'exposure', intensity: 2, target: 'self' }],
    })
    const show: ShowDef = { ...SHOW, rating: 'TV-PG' }
    const flirt = performer({ id: 'rex', shortName: '렉스', tags: ['host'], directives: [tease] })
    const broadcast = await open(quietSetup({ show, performers: [flirt, MO] }))
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'tease' }])
    const slowmo = broadcast.view().autoSlowmo
    expect(slowmo).toMatchObject({ gauge: 'sexual', step: 0 })
    expect(broadcast.events().find((event) => event.id === slowmo?.eventId)?.kind).toBe('exposure')

    run(broadcast, 5)
    expect(broadcast.view().autoSlowmo).toEqual(slowmo)
  })
})

describe('송출 중 게이지', () => {
  it('onAirGaugePerSecond는 송출되는 동안만 오른다', async () => {
    const drunk = performer({ id: 'mo', shortName: '모', tags: ['guest'], onAirGaugePerSecond: { drugs: 6 } })
    const broadcast = await open(quietSetup({ performers: [performer({ id: 'rex', tags: ['host'] }), drunk] }))
    run(broadcast, STEPS_PER_SECOND)
    expect(broadcast.view().gauges.drugs).toBeCloseTo(6)

    broadcast.step([{ type: 'switch', cameraId: 'audience' }])
    run(broadcast, STEPS_PER_SECOND)
    expect(broadcast.view().gauges.drugs).toBeCloseTo(6)
  })
})

describe('이탈', () => {
  it('내성 2 출연자에게 지시 3회 → 2초 뒤 walkedOut, 그를 가리키는 대상은 none처럼 처리한다', async () => {
    const lowRex = performer({ id: 'rex', shortName: '렉스', tolerance: 'low', tags: ['host'] })
    const broadcast = await open(setup({ performers: [lowRex, MO], staff: [], equipment: [] }))
    run(broadcast, 10)

    const calm: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'calm' }
    broadcast.step([calm, calm, calm])
    const walkout = broadcast.events().filter((event) => event.step === 10)
    expect(walkout.map((event) => [event.kind, event.intensity, event.sourceId])).toEqual([
      ['anger', 2, 'rex'],
      ['noise', 2, 'rex'],
    ])
    expect(broadcast.view().actors[0]).toMatchObject({ walkedOut: true, directivesLeft: 0 })

    // 모는 렉스의 분노에 반응하지만 원인(렉스)이 이탈했으므로 대상은 없다
    broadcast.step([])
    const moReaction = broadcast.events().find((event) => event.step === 11 && event.sourceId === 'mo')
    expect(moReaction).toMatchObject({ kind: 'anger', targetId: null, intensity: 3 })

    run(broadcast, 2 * STEPS_PER_SECOND)
    const rex = broadcast.view().actors.find((actor) => actor.id === 'rex')
    expect(rex).toMatchObject({ walkedOut: true, onAir: false })

    // 이탈자를 tag로 찾는 지시도 오류 없이 대상 없음으로 처리한다
    const chargeStep = broadcast.view().step
    broadcast.step([{ type: 'direct', actorId: 'mo', directiveId: 'charge' }])
    const charge = broadcast
      .events()
      .find((event) => event.step === chargeStep && event.sourceId === 'mo' && event.kind === 'noise')
    expect(charge).toMatchObject({ targetId: null })
    expect(() => run(broadcast, 5 * STEPS_PER_SECOND)).not.toThrow()
    expect(() => broadcast.step([calm])).toThrow('이미 이탈한 출연자')
  })
})

describe('광고', () => {
  const FLASH = directive('flash', {
    pose: 'laugh',
    emits: [
      { kind: 'exposure', intensity: 3, target: 'self' },
      { kind: 'exposure', intensity: 3, target: 'self' },
      { kind: 'exposure', intensity: 3, target: 'self' },
    ],
  })
  const flasher = performer({ id: 'rex', shortName: '렉스', tags: ['host'], directives: [FLASH] })
  const giggler = performer({
    id: 'mo',
    shortName: '모',
    tags: ['guest'],
    reactions: [
      {
        trigger: { kind: 'exposure', min: 1, scope: 'perceived' },
        action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'cause' }] },
      },
    ],
  })
  const adSetup = () =>
    quietSetup({ show: { ...SHOW, rating: 'TV-MA' }, performers: [flasher, giggler] })

  it('효과 개수가 AD_EFFECT_PICKS가 아니면 throw하고 광고를 쓰지 않는다', async () => {
    const broadcast = await open(adSetup())
    expect(() => broadcast.step([{ type: 'ad', effects: ['relief'] }])).toThrow()
    expect(broadcast.view()).toMatchObject({ phase: 'live', adsLeft: 1, step: 0 })
    expect(() => broadcast.resumeFromAd()).toThrow()
  })

  it('relief와 setup: 게이지 −25, 출연자 추가, 시청자 −10%, 이후 연쇄 깊이는 1부터', async () => {
    const broadcast = await open(adSetup())
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'flash' }])
    const before = broadcast.view()
    expect(before.gauges.sexual).toBe(54)

    broadcast.step([{ type: 'ad', effects: ['relief', 'setup'] }])
    const during = broadcast.view()
    expect(during.phase).toBe('adBreak')
    expect(during.step).toBe(1)
    expect(during.adsLeft).toBe(0)
    expect(during.gauges.sexual).toBe(54 - AD_GAUGE_RELIEF)
    expect(during.viewers).toBeCloseTo(before.viewers * 0.9)
    expect(during.actors.map((actor) => [actor.id, actor.x])).toEqual([
      ['rex', 4],
      ['mo', 6.5],
      ['june', 9.5],
    ])

    broadcast.step([])
    expect(broadcast.view()).toEqual(during)

    broadcast.resumeFromAd()
    broadcast.step([])
    const laughs = broadcast.events().filter((event) => event.kind === 'laughter')
    expect(laughs.length).toBeGreaterThan(0)
    expect(laughs[0]).toMatchObject({ step: 1, sourceId: 'mo', depth: 1 })
    expect(laughs[0].causeId).not.toBeNull()

    expect(() => broadcast.step([{ type: 'ad', effects: ['relief', 'reset'] }])).toThrow('남은 광고')
  })

  it('reset은 출연자를 home으로 되돌리고 pose와 피로를 초기화한다', async () => {
    const broadcast = await open(setup({ staff: [], equipment: [] }))
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'shout' }])
    run(broadcast, 30)
    expect(broadcast.view().fatigue).toBe(1)

    broadcast.step([{ type: 'ad', effects: ['reset', 'relief'] }])
    const view = broadcast.view()
    expect(view.fatigue).toBe(0)
    for (const actor of view.actors) {
      expect(actor.pose).toBe('idle')
      expect(actor.y).toBeCloseTo(0.85)
    }
    expect(view.actors.map((actor) => actor.x)).toEqual([4, 6.5])
  })
})

describe('반응과 시선', () => {
  it('스태프 반응은 담당 카메라 각도를 무작위로 바꾼다', async () => {
    const shouter = performer({
      id: 'rex',
      shortName: '렉스',
      tags: ['host'],
      reactions: [{ trigger: { kind: 'corner', tag: 'host' }, action: { pose: 'angry', emits: [{ kind: 'noise', intensity: 2, target: 'none' }] } }],
    })
    const broadcast = await open(setup({ performers: [shouter, MO], equipment: [] }))
    run(broadcast, 2)
    expect(broadcast.view().cameraAngles.close).not.toBe(0)
    expect(broadcast.view().log.map((line) => line.text)).toContain('카메라 감독이 놀라 카메라를 휘둘렀다')
  })

  it('송출 화면에 새로 들어오면 gaze enter, 오래 빠져 있으면 absentFor 반응을 한다', async () => {
    const show = performer({
      id: 'rex',
      shortName: '렉스',
      tags: ['host'],
      reactions: [
        { trigger: { kind: 'gaze', when: 'enter' }, action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'none' }] } },
        { trigger: { kind: 'gaze', when: 'absentFor', seconds: 2 }, action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 1, target: 'onAirCamera' }] } },
      ],
    })
    const broadcast = await open(quietSetup({ performers: [show, performer({ id: 'mo', tags: ['guest'] })] }))
    broadcast.step([{ type: 'switch', cameraId: 'audience' }])
    run(broadcast, 2 * STEPS_PER_SECOND)
    const absent = broadcast.events().find((event) => event.kind === 'anger')
    expect(absent).toMatchObject({ sourceId: 'rex', targetId: 'audience', depth: 2 })
    expect(broadcast.events().find((event) => event.id === absent?.causeId)).toMatchObject({
      kind: 'gaze',
      sourceId: 'broadcast',
      targetId: 'rex',
    })

    // gaze 반응 쿨다운(1초, 현상 종류 단위)이 지난 뒤 화면에 다시 잡는다
    run(broadcast, STEPS_PER_SECOND)
    broadcast.step([{ type: 'switch', cameraId: 'wide' }])
    const enter = broadcast.events().filter((event) => event.kind === 'laughter')
    expect(enter).toEqual([expect.objectContaining({ sourceId: 'rex', depth: 2 })])
    expect(broadcast.view().log.map((line) => line.text)).toContain('와이드가 렉스를 잡았다')
  })

  it('반응은 다음 스텝에 한 단계씩 전파되고 longestChain이 그 연쇄를 돌려준다', async () => {
    const broadcast = await open(setup({ staff: [], equipment: [] }))
    run(broadcast, 10)
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'shout' }])
    const shout = broadcast.events().at(-1)
    expect(shout).toMatchObject({ kind: 'anger', sourceId: 'rex', targetId: 'mo', step: 10 })
    expect(broadcast.events().some((event) => event.sourceId === 'mo' && event.step === 10)).toBe(false)

    broadcast.step([])
    expect(broadcast.events().find((event) => event.sourceId === 'mo' && event.step === 11)).toMatchObject({
      kind: 'anger',
      intensity: 3,
      targetId: 'rex',
      depth: 2,
    })
    const chain = broadcast.longestChain()
    expect(chain.map((line) => line.depth)).toEqual([1, 2])
    expect(chain[0].text).toBe('렉스가 모에게 버럭 화를 낸다')
    expect(chain[1].text).toBe('모가 욕설을 했다! (삐—)')
  })
})
