import { afterEach, describe, expect, it } from 'vitest'
import {
  AD_GAUGE_RELIEF,
  AUDIENCE_NOISE_SECONDS,
  CORNER_STEPS,
  GRAVITY,
  LEAP_VERTICAL_RATIO,
  MOTION_CAUSE_SECONDS,
  REACTION_COOLDOWN_SECONDS,
  STEP_SECONDS,
} from '@/content/balance'
import type {
  ActionDef,
  CameraDef,
  DirectiveDef,
  EquipmentDef,
  PerformerDef,
  ReactionDef,
  ShowDef,
  StaffDef,
} from '@/content/types'
import { STANDING_Y } from './cast'
import { Broadcast, replay, type BroadcastInput, type BroadcastSetup } from './engine'
import type { PhenomenonEvent } from './phenomena'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)

const camera = (overrides: Partial<CameraDef> & { id: string }): CameraDef => ({
  label: overrides.id,
  position: { x: 0, y: 0 },
  defaultAngle: 0,
  fovDegrees: 60,
  range: 10,
  shotIntensity: 1,
  ...overrides,
})

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
    // 무대 전체와 스튜디오 가운데를 잡고 관객석(x 1.5)은 잡지 않는다
    camera({
      id: 'wide',
      label: '와이드',
      position: { x: 8, y: 8 },
      defaultAngle: -90,
      fovDegrees: 80,
      range: 12,
    }),
    camera({
      id: 'close',
      label: '클로즈업',
      position: { x: 2, y: 1 },
      fovDegrees: 30,
      range: 6,
      shotIntensity: 2,
    }),
    // 관객 구역만 잡고 무대의 누구도 잡지 않는다
    camera({
      id: 'audienceCam',
      label: '관객석',
      position: { x: 1.5, y: 4 },
      defaultAngle: -90,
      fovDegrees: 40,
      range: 4,
    }),
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

const reaction = (trigger: ReactionDef['trigger'], action: ActionDef): ReactionDef => ({
  trigger,
  action,
})

const cornerNoise = (tag: string): ReactionDef =>
  reaction(
    { kind: 'corner', tag },
    { pose: 'idle', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
  )

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
    reaction(
      { kind: 'anger', min: 1, scope: 'perceived' },
      {
        pose: 'angry',
        move: { type: 'leap', toward: 'cause', speed: 8 },
        emits: [{ kind: 'anger', intensity: 'causePlusOne', target: 'cause' }],
      },
    ),
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
    reaction({ kind: 'noise', min: 2, scope: 'perceived' }, { pose: 'panic', emits: [] }),
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
    performers: [
      performer({ id: 'rex', shortName: '렉스', tags: ['host'] }),
      performer({ id: 'mo', shortName: '모', tags: ['guest'] }),
    ],
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
function run(
  broadcast: Broadcast,
  steps: number,
  inputs: Map<number, BroadcastInput[]> = new Map(),
): void {
  const target = broadcast.currentStep + steps
  let fedStep = -1
  while (broadcast.currentStep < target && broadcast.phase !== 'ended') {
    const step = broadcast.currentStep
    broadcast.step(step === fedStep ? [] : (inputs.get(step) ?? []))
    fedStep = step
    if (broadcast.phase === 'adBreak') broadcast.resumeFromAd()
  }
}

/** 조건에 맞는 이벤트가 생길 때까지 최대 maxSteps 스텝을 돈다. */
function runUntil(
  broadcast: Broadcast,
  maxSteps: number,
  match: (event: PhenomenonEvent) => boolean,
): PhenomenonEvent {
  for (let i = 0; i < maxSteps; i++) {
    broadcast.step([])
    const found = broadcast.events().find(match)
    if (found !== undefined) return found
  }
  throw new Error(`${maxSteps} 스텝 안에 기대한 이벤트가 생기지 않았습니다.`)
}

const kindsOf = (events: PhenomenonEvent[]) => events.map((event) => event.kind)

describe('Broadcast.create', () => {
  it('콘텐츠 검증 오류가 있으면 그 목록으로 throw한다', async () => {
    const broken = performer({
      id: 'broken',
      directives: [
        directive('x', {
          pose: 'idle',
          emits: [{ kind: 'noise', intensity: 1, target: { tag: 'nobody' } }],
        }),
      ],
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
    expect(view.cameraAngles).toEqual({ wide: -90, close: 0, audienceCam: -90 })
    expect(view.actors.map((actor) => [actor.id, actor.x])).toEqual([
      ['rex', 4],
      ['mo', 6.5],
    ])
    expect(view.actors[0]).toMatchObject({
      name: '렉스 캘러웨이',
      pose: 'idle',
      onAir: true,
      walkedOut: false,
      directivesLeft: 3,
    })
    expect(view.equipment).toEqual([{ id: 'light', x: 8, y: 6, angle: 0, released: false }])
    expect(view.limits).toEqual({ sexual: 70, violence: 70, drugs: 60, language: 50 })
    expect(view.benchLeft).toBe(1)
  })

  it('dispose는 두 번 불러도 안전하고, 그 뒤 step은 오류를 던진다', async () => {
    const broadcast = await Broadcast.create(quietSetup())
    broadcast.dispose()
    expect(() => broadcast.dispose()).not.toThrow()
    expect(() => broadcast.step([])).toThrow('dispose')
  })
})

describe('결정론', () => {
  const shout: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'shout' }
  const charge: BroadcastInput = { type: 'direct', actorId: 'mo', directiveId: 'charge' }
  const INPUTS = new Map<number, BroadcastInput[]>([
    [30, [{ type: 'switch', cameraId: 'close' }]],
    [60, [shout]],
    [120, [{ type: 'directStaff', staffId: 'cammy', directiveId: 'audience' }]],
    [200, [{ type: 'switch', cameraId: 'wide' }]],
    [400, [charge]],
    [900, [shout, shout]],
    [1500, [{ type: 'ad', effects: ['relief', 'reset'] }]],
    [1800, [charge]],
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

describe('입력 검증(Ruling 20)', () => {
  it('하나라도 잘못된 입력이 있으면 아무것도 적용·기록하지 않고 throw한다', async () => {
    const broadcast = await open(setup())
    const before = broadcast.view()
    expect(() =>
      broadcast.step([
        { type: 'switch', cameraId: 'close' },
        { type: 'direct', actorId: 'rex', directiveId: 'shout' },
        { type: 'direct', actorId: 'ghost', directiveId: 'calm' },
      ]),
    ).toThrow('무대에 없는 출연자')
    expect(broadcast.view()).toEqual(before)
    expect(broadcast.inputLog()).toEqual([])
  })

  it('같은 묶음 안에서 이탈한 뒤의 지시도 미리 걸러낸다', async () => {
    const lowRex = performer({ id: 'rex', shortName: '렉스', tolerance: 'low', tags: ['host'] })
    const broadcast = await open(quietSetup({ performers: [lowRex, MO] }))
    const calm: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'calm' }
    expect(() => broadcast.step([calm, calm, calm, calm])).toThrow('이미 이탈한 출연자')
    expect(broadcast.view()).toMatchObject({ fatigue: 0, step: 0 })
    expect(broadcast.view().actors[0].walkedOut).toBe(false)
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
  const silences = (broadcast: Broadcast) =>
    broadcast.events().filter((event) => event.kind === 'silence')

  it('아무 일도 없으면 5초 뒤 silence 강도 1 이벤트가 생긴다', async () => {
    const broadcast = await open(quietSetup())
    run(broadcast, 5 * STEPS_PER_SECOND - 1)
    expect(silences(broadcast)).toEqual([])

    run(broadcast, 1)
    expect(silences(broadcast)).toEqual([
      expect.objectContaining({
        intensity: 1,
        sourceId: 'broadcast',
        step: 5 * STEPS_PER_SECOND - 1,
      }),
    ])
    expect(broadcast.view().log.at(-1)?.text).toBe('방송에 정적이 흐른다…')
  })

  it('정적이 이어지면 10초, 15초에 강도 2, 3이 나오고 시청자가 줄어든다', async () => {
    const broadcast = await open(quietSetup())
    const start = broadcast.view().viewers
    run(broadcast, 15 * STEPS_PER_SECOND)
    expect(silences(broadcast).map((event) => event.intensity)).toEqual([1, 2, 3])
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
  const PG_SHOW: ShowDef = { ...SHOW, rating: 'TV-PG' }

  it('개입으로 두 게이지가 같은 스텝에 상한을 넘으면 그 스텝에 끝나고 앞선 게이지가 원인이다', async () => {
    const wild = performer({ id: 'rex', tags: ['host'], directives: [OVERBOARD] })
    const broadcast = await open(quietSetup({ show: PG_SHOW, performers: [wild, MO] }))
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

  it('상한 80% 도달은 자동 슬로모션을 건다(같은 게이지는 한 번)', async () => {
    const tease = directive('tease', {
      pose: 'laugh',
      emits: [
        { kind: 'exposure', intensity: 2, target: 'self' },
        { kind: 'exposure', intensity: 2, target: 'self' },
      ],
    })
    const flirt = performer({ id: 'rex', tags: ['host'], directives: [tease] })
    const broadcast = await open(quietSetup({ show: PG_SHOW, performers: [flirt, MO] }))
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'tease' }])
    const slowmo = broadcast.view().autoSlowmo
    expect(slowmo).toMatchObject({ gauge: 'sexual', step: 0 })
    const trigger = broadcast.events().find((event) => event.id === slowmo?.eventId)
    expect(trigger?.kind).toBe('exposure')

    run(broadcast, 5)
    expect(broadcast.view().autoSlowmo).toEqual(slowmo)
  })
})

describe('송출 중 게이지', () => {
  it('onAirGaugePerSecond는 송출되는 동안만 오른다', async () => {
    const drunk = performer({ id: 'mo', tags: ['guest'], onAirGaugePerSecond: { drugs: 6 } })
    const sober = performer({ id: 'rex', tags: ['host'] })
    const broadcast = await open(quietSetup({ performers: [sober, drunk] }))
    run(broadcast, STEPS_PER_SECOND)
    expect(broadcast.view().gauges.drugs).toBeCloseTo(6)

    broadcast.step([{ type: 'switch', cameraId: 'audienceCam' }])
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
    const moReaction = broadcast
      .events()
      .find((event) => event.step === 11 && event.sourceId === 'mo')
    expect(moReaction).toMatchObject({ kind: 'anger', targetId: null, intensity: 3 })

    run(broadcast, 2 * STEPS_PER_SECOND)
    const rex = broadcast.view().actors.find((actor) => actor.id === 'rex')
    expect(rex).toMatchObject({ walkedOut: true, onAir: false })

    // 이탈자를 tag로 찾는 지시도 오류 없이 대상 없음으로 처리한다
    const chargeStep = broadcast.currentStep
    broadcast.step([{ type: 'direct', actorId: 'mo', directiveId: 'charge' }])
    const charge = broadcast
      .events()
      .find((event) => event.step === chargeStep && event.sourceId === 'mo')
    expect(charge).toMatchObject({ kind: 'noise', targetId: null })
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
  const flasher = performer({ id: 'rex', tags: ['host'], directives: [FLASH] })
  const giggler = performer({
    id: 'mo',
    tags: ['guest'],
    reactions: [
      reaction(
        { kind: 'exposure', min: 1, scope: 'perceived' },
        { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'cause' }] },
      ),
    ],
  })
  const adSetup = (overrides: Partial<BroadcastSetup> = {}) =>
    quietSetup({
      show: { ...SHOW, rating: 'TV-MA' },
      performers: [flasher, giggler],
      ...overrides,
    })
  const flash: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'flash' }
  const laughs = (broadcast: Broadcast) =>
    broadcast.events().filter((event) => event.kind === 'laughter')

  it('효과 개수가 AD_EFFECT_PICKS가 아니면 throw하고 광고를 쓰지 않는다', async () => {
    const broadcast = await open(adSetup())
    expect(() => broadcast.step([{ type: 'ad', effects: ['relief'] }])).toThrow()
    expect(broadcast.view()).toMatchObject({ phase: 'live', adsLeft: 1, step: 0 })
    expect(() => broadcast.resumeFromAd()).toThrow()
  })

  it('relief와 setup: 게이지 −25, 출연자 추가, 시청자 −10%, 이후 연쇄 깊이는 1부터', async () => {
    const broadcast = await open(adSetup())
    broadcast.step([flash])
    const before = broadcast.view()
    expect(before.gauges.sexual).toBe(54)

    broadcast.step([{ type: 'ad', effects: ['relief', 'setup'] }])
    const during = broadcast.view()
    expect(during.phase).toBe('adBreak')
    expect(during.step).toBe(1)
    expect(during.adsLeft).toBe(0)
    expect(during.benchLeft).toBe(0)
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
    expect(laughs(broadcast).length).toBeGreaterThan(0)
    expect(laughs(broadcast)[0]).toMatchObject({ step: 1, sourceId: 'mo', depth: 1 })
    expect(laughs(broadcast)[0].causeId).not.toBeNull()

    const again: BroadcastInput = { type: 'ad', effects: ['relief', 'reset'] }
    expect(() => broadcast.step([again])).toThrow('남은 광고')
  })

  it('대기 출연자가 없으면 setup 효과는 throw한다(Ruling 21)', async () => {
    const broadcast = await open(adSetup({ bench: [] }))
    expect(broadcast.view().benchLeft).toBe(0)
    expect(() => broadcast.step([{ type: 'ad', effects: ['relief', 'setup'] }])).toThrow(
      '대기 출연자',
    )
    expect(broadcast.view()).toMatchObject({ phase: 'live', adsLeft: 1 })
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
      expect(actor.y).toBeCloseTo(STANDING_Y)
    }
    expect(view.actors.map((actor) => actor.x)).toEqual([4, 6.5])
  })

  it('reset은 광고 전 사고에 대한 대기 반응을 비운다(Ruling 22)', async () => {
    const broadcast = await open(adSetup())
    broadcast.step([flash])
    broadcast.step([{ type: 'ad', effects: ['reset', 'relief'] }])
    broadcast.resumeFromAd()
    run(broadcast, 5)
    expect(laughs(broadcast)).toEqual([])
  })
})

describe('반응과 시선', () => {
  it('스태프 반응은 담당 카메라 각도를 무작위로 바꾼다', async () => {
    const shouter = performer({
      id: 'rex',
      tags: ['host'],
      reactions: [
        reaction(
          { kind: 'corner', tag: 'host' },
          { pose: 'angry', emits: [{ kind: 'noise', intensity: 2, target: 'none' }] },
        ),
      ],
    })
    const broadcast = await open(setup({ performers: [shouter, MO], equipment: [] }))
    run(broadcast, 2)
    expect(broadcast.view().cameraAngles.close).not.toBe(0)
    expect(broadcast.view().log.map((line) => line.text)).toContain(
      '카메라 감독이 놀라 카메라를 휘둘렀다',
    )
  })

  it('송출 화면에 새로 들어오면 enter, 오래 빠져 있으면 absentFor 반응을 원인 없이 한다(Ruling 23)', async () => {
    const watched = performer({
      id: 'rex',
      shortName: '렉스',
      tags: ['host'],
      reactions: [
        reaction(
          { kind: 'gaze', when: 'enter' },
          { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'none' }] },
        ),
        reaction(
          { kind: 'gaze', when: 'absentFor', seconds: 2 },
          { pose: 'angry', emits: [{ kind: 'anger', intensity: 1, target: 'onAirCamera' }] },
        ),
      ],
    })
    const other = performer({ id: 'mo', tags: ['guest'] })
    const broadcast = await open(quietSetup({ performers: [watched, other] }))
    broadcast.step([{ type: 'switch', cameraId: 'audienceCam' }])
    run(broadcast, 2 * STEPS_PER_SECOND)
    const absent = broadcast.events().find((event) => event.kind === 'anger')
    expect(absent).toMatchObject({
      sourceId: 'rex',
      targetId: 'audienceCam',
      causeId: null,
      depth: 1,
    })
    expect(broadcast.view().log.map((line) => line.text)).toContain(
      '렉스가 한동안 화면에 잡히지 않았다',
    )

    // gaze 반응 쿨다운(1초, 현상 종류 단위)이 지난 뒤 화면에 다시 잡는다
    run(broadcast, STEPS_PER_SECOND)
    broadcast.step([{ type: 'switch', cameraId: 'wide' }])
    expect(broadcast.events().filter((event) => event.kind === 'laughter')).toEqual([
      expect.objectContaining({ sourceId: 'rex', causeId: null, depth: 1 }),
    ])
    expect(broadcast.events().some((event) => event.kind === 'gaze')).toBe(false)
    expect(broadcast.view().log.map((line) => line.text)).toContain('와이드가 렉스를 잡았다')
  })

  it('반응은 다음 스텝에 한 단계씩 전파되고 longestChain이 그 연쇄를 돌려준다', async () => {
    const broadcast = await open(setup({ staff: [], equipment: [] }))
    run(broadcast, 10)
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'shout' }])
    const fromMo = (step: number) =>
      broadcast.events().find((event) => event.sourceId === 'mo' && event.step === step)
    expect(broadcast.events().at(-1)).toMatchObject({
      kind: 'anger',
      sourceId: 'rex',
      targetId: 'mo',
      step: 10,
    })
    expect(fromMo(10)).toBeUndefined()

    broadcast.step([])
    expect(fromMo(11)).toMatchObject({ kind: 'anger', intensity: 3, targetId: 'rex', depth: 2 })
    const chain = broadcast.longestChain()
    expect(chain.map((line) => line.depth)).toEqual([1, 2])
    expect(chain[0].text).toBe('렉스가 모에게 버럭 화를 낸다')
    expect(chain[1].text).toBe('모가 욕설을 했다! (삐—)')
  })
})

describe('장비 파손 연쇄', () => {
  // 조명(x 8, y 6) 바로 아래에서 수직으로 뛰는 출연자. 접촉 때 상대 속도가 강도 2에 이른다.
  const JUMP = directive('jump', {
    pose: 'laugh',
    move: { type: 'leap', toward: 'none', speed: 20 },
    emits: [],
  })
  const darknessPanic = reaction(
    { kind: 'darkness', min: 1, scope: 'perceived' },
    { pose: 'panic', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
  )
  const lightSetup = () =>
    quietSetup({
      show: { ...SHOW, rating: 'TV-MA', homeSpots: [{ x: 8 }, { x: 6.5 }, { x: 13 }] },
      performers: [
        performer({ id: 'jumper', directives: [JUMP] }),
        // 어둠 구역(6~10) 안과 밖
        performer({ id: 'inside', reactions: [darknessPanic] }),
        performer({ id: 'outside', reactions: [darknessPanic] }),
      ],
      equipment: [LIGHT],
    })

  it('충격 → 조명 파손 → 어둠 → 낙하 충격이 원인으로 이어진다', async () => {
    const broadcast = await open(lightSetup())
    // 생성 직후 첫 스텝에 바로 뛰어도 이륙은 충격이 아니다(Ruling 24)
    broadcast.step([{ type: 'direct', actorId: 'jumper', directiveId: 'jump' }])
    expect(broadcast.events().filter((event) => event.kind === 'impact')).toEqual([])

    const breakImpact = runUntil(
      broadcast,
      STEPS_PER_SECOND,
      (event) => event.kind === 'impact' && event.targetId === 'light',
    )
    expect(breakImpact).toMatchObject({ sourceId: 'jumper', intensity: 2 })
    expect(broadcast.view().equipment[0].released).toBe(true)

    const onBreak = broadcast
      .events()
      .filter((event) => event.sourceId === 'light' && event.step === breakImpact.step)
    expect(kindsOf(onBreak)).toEqual(['impact', 'noise', 'darkness'])
    for (const event of onBreak) expect(event.causeId).toBe(breakImpact.id)
    const darkness = onBreak[2]
    expect(darkness).toMatchObject({ intensity: 2, x: 8, y: STANDING_Y })

    // 어둠은 구역 안(inDarkness)의 출연자만 지각한다
    broadcast.step([])
    const reactions = broadcast.events().filter((event) => event.step === breakImpact.step + 1)
    expect(reactions).toEqual([
      expect.objectContaining({ sourceId: 'inside', kind: 'noise', causeId: darkness.id }),
    ])

    // 떨어진 조명이 사람을 치면 source는 조명(Ruling 9), 원인은 파손 충격이다
    const fallingHit = runUntil(
      broadcast,
      3 * STEPS_PER_SECOND,
      (event) => event.kind === 'impact' && event.sourceId === 'light' && event.targetId !== null,
    )
    expect(fallingHit).toMatchObject({ targetId: 'jumper', causeId: breakImpact.id, depth: 2 })
  })
})

describe('관객(Ruling 17)', () => {
  const NOISE_STEPS = Math.round(AUDIENCE_NOISE_SECONDS * STEPS_PER_SECOND)
  const COOLDOWN_STEPS = Math.round(REACTION_COOLDOWN_SECONDS * STEPS_PER_SECOND)
  const fromAudience = (broadcast: Broadcast, kind: PhenomenonEvent['kind']) =>
    broadcast.events().filter((event) => event.sourceId === 'audience' && event.kind === kind)

  it('관객석이 송출되는 동안 AUDIENCE_NOISE_SECONDS마다 관객 구역 중앙에서 소음 1을 낸다', async () => {
    const broadcast = await open(quietSetup())
    broadcast.step([{ type: 'switch', cameraId: 'audienceCam' }])
    run(broadcast, 2 * NOISE_STEPS - 1)
    expect(fromAudience(broadcast, 'noise')).toEqual([
      expect.objectContaining({
        intensity: 1,
        targetId: null,
        x: 1.5,
        y: STANDING_Y,
        step: NOISE_STEPS - 1,
        causeId: null,
      }),
      expect.objectContaining({ step: 2 * NOISE_STEPS - 1 }),
    ])
    expect(broadcast.view().log.map((line) => line.text)).toContain('관객 쪽에서 소리가 난다')

    // 관객석이 화면에서 빠지면 소음도 멈춘다
    broadcast.step([{ type: 'switch', cameraId: 'wide' }])
    run(broadcast, 2 * NOISE_STEPS)
    expect(fromAudience(broadcast, 'noise')).toHaveLength(2)
  })

  it('광고의 reset은 관객석 연속 송출 시간을 처음부터 다시 센다', async () => {
    const broadcast = await open(quietSetup())
    broadcast.step([{ type: 'switch', cameraId: 'audienceCam' }])
    const adStep = 2 * STEPS_PER_SECOND
    run(broadcast, adStep - 1)
    run(
      broadcast,
      NOISE_STEPS + 1,
      new Map([[adStep, [{ type: 'ad', effects: ['reset', 'relief'] }]]]),
    )
    // reset이 없었다면 첫 소음은 NOISE_STEPS - 1 스텝에 난다
    expect(fromAudience(broadcast, 'noise').map((event) => event.step)).toEqual([
      adStep + NOISE_STEPS - 1,
    ])
  })

  it('송출 화면이 관객석을 잡지 않으면 소음을 내지 않는다', async () => {
    const broadcast = await open(quietSetup())
    run(broadcast, 2 * NOISE_STEPS)
    expect(fromAudience(broadcast, 'noise')).toEqual([])
  })

  it('시야 안의 웃음에 다음 스텝에 웃음 1로 전염되고, 같은 현상 반응은 1초 쿨다운이다', async () => {
    const LAUGH = directive('laugh', {
      pose: 'laugh',
      emits: [{ kind: 'laughter', intensity: 1, target: 'none' }],
    })
    // home x 4는 관객 구역 중앙(1.5)에서 SIGHT_RADIUS 안이다
    const laugher = performer({ id: 'priya', tags: ['host'], directives: [LAUGH, CALM] })
    const other = performer({ id: 'mo', tags: ['guest'] })
    const broadcast = await open(quietSetup({ performers: [laugher, other] }))
    const laugh: BroadcastInput = { type: 'direct', actorId: 'priya', directiveId: 'laugh' }

    broadcast.step([laugh])
    const first = broadcast.events().find((event) => event.sourceId === 'priya')
    if (first === undefined) throw new Error('웃음 이벤트가 없습니다.')
    expect(fromAudience(broadcast, 'laughter')).toEqual([])

    broadcast.step([])
    expect(fromAudience(broadcast, 'laughter')).toEqual([
      expect.objectContaining({
        intensity: 1,
        targetId: null,
        x: 1.5,
        causeId: first.id,
        depth: 2,
        step: 1,
      }),
    ])

    // 쿨다운 끝 직전(첫 전염 뒤 COOLDOWN_STEPS - 1 스텝)에 판정하는 웃음은 막힌다.
    // 자기 웃음에도 반응하지 않는다.
    const contagionStep = 1
    run(broadcast, contagionStep + COOLDOWN_STEPS - 2 - broadcast.currentStep)
    broadcast.step([laugh])
    broadcast.step([laugh])
    expect(broadcast.currentStep).toBe(contagionStep + COOLDOWN_STEPS)
    expect(fromAudience(broadcast, 'laughter')).toHaveLength(1)

    // 정확히 COOLDOWN_STEPS 뒤에 판정하는 웃음에는 다시 전염된다
    broadcast.step([])
    expect(fromAudience(broadcast, 'laughter')).toEqual([
      expect.objectContaining({ step: contagionStep }),
      expect.objectContaining({ step: contagionStep + COOLDOWN_STEPS }),
    ])
  })

  it('시야 밖의 웃음에는 반응하지 않는다', async () => {
    const LAUGH = directive('laugh', {
      pose: 'laugh',
      emits: [{ kind: 'laughter', intensity: 1, target: 'none' }],
    })
    const far = performer({ id: 'far', tags: ['guest'], directives: [LAUGH, CALM] })
    const broadcast = await open(
      quietSetup({
        show: { ...SHOW, homeSpots: [{ x: 4 }, { x: 12 }] },
        performers: [performer({ id: 'rex', tags: ['host'] }), far],
      }),
    )
    broadcast.step([{ type: 'direct', actorId: 'far', directiveId: 'laugh' }])
    run(broadcast, 2)
    expect(fromAudience(broadcast, 'laughter')).toEqual([])
  })
})

describe('움직임 원인 만료(Ruling 29)', () => {
  const NOISE = directive('noise', {
    pose: 'angry',
    emits: [{ kind: 'noise', intensity: 1, target: 'none' }],
  })
  /** 소음에 놀라 수직으로 뛰는 출연자. 체공 시간 = 2 × 수직 속도 / g */
  const jumper = (speed: number) =>
    performer({
      id: 'mo',
      tags: ['guest'],
      reactions: [
        reaction(
          { kind: 'noise', min: 1, scope: 'perceived' },
          { pose: 'panic', move: { type: 'leap', toward: 'none', speed }, emits: [] },
        ),
      ],
    })
  const airSeconds = (speed: number) => (2 * speed * LEAP_VERTICAL_RATIO) / -GRAVITY.y

  async function landingImpact(speed: number) {
    const shouter = performer({ id: 'rex', tags: ['host'], directives: [NOISE, CALM] })
    const broadcast = await open(quietSetup({ performers: [shouter, jumper(speed)] }))
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'noise' }])
    const noise = broadcast.events()[0]
    const landing = runUntil(
      broadcast,
      4 * STEPS_PER_SECOND,
      (event) => event.kind === 'impact' && event.sourceId === 'mo',
    )
    return { noise, landing }
  }

  it(`원인을 받은 지 ${MOTION_CAUSE_SECONDS}초 안의 충돌은 그 원인을 잇는다`, async () => {
    expect(airSeconds(10)).toBeLessThan(MOTION_CAUSE_SECONDS)
    const { noise, landing } = await landingImpact(10)
    expect(landing).toMatchObject({ causeId: noise.id, depth: 2 })
  })

  it(`${MOTION_CAUSE_SECONDS}초가 지난 뒤의 충돌은 그 원인을 잇지 않는다`, async () => {
    expect(airSeconds(18)).toBeGreaterThan(MOTION_CAUSE_SECONDS)
    const { landing } = await landingImpact(18)
    expect(landing).toMatchObject({ causeId: null, depth: 1 })
  })
})
