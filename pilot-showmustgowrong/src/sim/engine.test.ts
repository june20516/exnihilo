import { afterEach, describe, expect, it } from 'vitest'
import {
  AD_GAUGE_RELIEF,
  AD_VIEWER_LOSS,
  AUDIENCE_NOISE_SECONDS,
  BROADCAST_STEPS,
  CORNER_STEPS,
  FATIGUE_MISFIRE_PER_POINT,
  GRAVITY,
  LEAP_VERTICAL_RATIO,
  MOTION_CAUSE_SECONDS,
  PHENOMENON_DISPLAY_SECONDS,
  REACTION_COOLDOWN_SECONDS,
  STAFF_FATIGUE_MISFIRE_PER_POINT,
  STEP_SECONDS,
  WALKOUT_SECONDS,
} from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
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
import { fixtureColor } from '@/test-support/fixtureColor'
import { STANDING_Y } from './cast'
import { Broadcast, replay, type BroadcastInput, type BroadcastSetup } from './engine'
import type { PhenomenonEvent } from './phenomena'
import { yawBetween } from './vec'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)

const camera = (overrides: Partial<CameraDef> & { id: string }): CameraDef => ({
  label: overrides.id,
  position: { x: 0, y: 0, z: 0 },
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
  showMinutes: 30,
  startTime: { hour: 21, minute: 0 },
  traits: [],
  corners: [
    { label: '오프닝', startTag: 'host' },
    { label: '토크', startTag: 'guest' },
    { label: '게임', startTag: 'host' },
  ],
  cameras: [
    // 앞쪽에서 무대(z 4 줄) 전체를 잡고 관객석 중앙(1.5, 4)은 잡지 않는다
    camera({
      id: 'wide',
      label: '와이드',
      position: { x: 8, y: 6, z: 9.5 },
      defaultAngle: -90,
      fovDegrees: 80,
      range: 12,
    }),
    // 관객석 가장자리에서 +x로 무대 왼쪽을 본다
    camera({
      id: 'close',
      label: '클로즈업',
      position: { x: 2, y: 1, z: 4 },
      fovDegrees: 30,
      range: 6,
      shotIntensity: 2,
      tracking: true,
    }),
    // 관객 구역만 잡고 무대의 누구도 잡지 않는다
    camera({
      id: 'audienceCam',
      label: '관객석',
      position: { x: 1.5, y: 4, z: 9.5 },
      defaultAngle: -90,
      fovDegrees: 40,
      range: 6,
    }),
  ],
  homeSpots: [
    { x: 4, z: 4 },
    { x: 6.5, z: 4 },
    { x: 9.5, z: 4 },
    { x: 12, z: 4 },
  ],
  benchSpot: { x: 15, z: 6 },
  exit: { x: 15.8, z: 4 },
  audienceZone: { minX: 0, maxX: 3, minZ: 1, maxZ: 7 },
  autoCut: { rotation: ['wide', 'close', 'wide', 'audienceCam'], incidentCamera: 'close', fallbackCamera: 'wide' },
}

const directive = (id: string, action: ActionDef): DirectiveDef => ({ id, label: id, expect: id, action })

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
  color: fixtureColor(overrides.id),
  role: '역할',
  tendency: '성향',
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
  role: '카메라 감독',
  tendency: '소음 2↑에 놀람',
  cameraId: 'close',
  reactions: [
    reaction({ kind: 'noise', min: 2, scope: 'perceived' }, { pose: 'panic', emits: [] }),
  ],
  directives: [
    { id: 'audience', label: '관객석 비춰 주세요', expect: '관객석', aim: 'audience' },
    { id: 'calm', label: '침착하세요', expect: '기본 방향', aim: 'default' },
  ],
}

const LIGHT: EquipmentDef = {
  id: 'light',
  name: '과열된 조명',
  kind: 'hangingLight',
  position: { x: 8, y: 6, z: 4 },
  breakAt: 2,
  onBreak: [
    { kind: 'impact', intensity: 3, target: 'none' },
    { kind: 'noise', intensity: 3, target: 'none' },
  ],
  darknessZone: { x: 8, z: 4, radius: 2 },
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

/** steps 스텝을 끝까지 돌린다. 광고 입력을 받은 스텝 뒤에는 바로 재개한다. */
function run(
  broadcast: Broadcast,
  steps: number,
  inputs: Map<number, BroadcastInput[]> = new Map(),
): void {
  const target = broadcast.currentStep + steps
  while (broadcast.currentStep < target && broadcast.phase !== 'ended') {
    broadcast.step(inputs.get(broadcast.currentStep) ?? [])
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
    expect(view.actors.map((actor) => [actor.id, actor.z])).toEqual([
      ['rex', 4],
      ['mo', 4],
    ])
    expect(view.actors[0].up).toEqual({ x: 0, y: 1, z: 0 })
    expect(view.equipment).toEqual([
      {
        id: 'light',
        kind: 'hangingLight',
        x: 8,
        y: 6,
        z: 4,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        released: false,
      },
    ])
    expect(view.limits).toEqual({ sexual: 70, violence: 70, drugs: 60, language: 50 })
    expect(view.benchLeft).toBe(1)
  })

  it('dispose는 두 번 불러도 안전하고, 그 뒤 step과 view는 오류를 던진다', async () => {
    const broadcast = await Broadcast.create(quietSetup())
    broadcast.view() // 캐시를 채운 뒤에도 dispose 후 view는 오류여야 한다
    broadcast.dispose()
    expect(() => broadcast.dispose()).not.toThrow()
    expect(() => broadcast.step([])).toThrow('dispose')
    expect(() => broadcast.view()).toThrow('dispose')
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

describe('광고 스텝(Ruling 36)', () => {
  const realSetup = (): BroadcastSetup => ({ show: TALK_SHOW, ...LINEUP, seed: 7 })
  const AD_STEP = 30
  const TOTAL_STEPS = 600

  /** AD_STEP까지 돌리고 광고를 받은 뒤 재개 직후 스텝에 afterResume을 넣고 TOTAL_STEPS까지 돌린다. */
  async function adThenResume(afterResume: BroadcastInput[]): Promise<Broadcast> {
    const broadcast = await open(realSetup())
    run(broadcast, AD_STEP)
    broadcast.step([{ type: 'ad', effects: ['setup', 'relief'] }])
    broadcast.resumeFromAd()
    broadcast.step(afterResume)
    run(broadcast, TOTAL_STEPS - broadcast.currentStep)
    return broadcast
  }

  it('광고 입력을 받은 스텝도 스텝 수를 1 올리고, 물리·현상은 진행하지 않는다', async () => {
    const broadcast = await open(quietSetup())
    run(broadcast, 10)
    const before = broadcast.view()
    broadcast.step([{ type: 'ad', effects: ['relief', 'reset'] }])
    const during = broadcast.view()
    expect(during).toMatchObject({ phase: 'adBreak', step: before.step + 1 })
    expect(broadcast.events()).toHaveLength(0)
    expect(during.actors.map((actor) => actor.x)).toEqual(before.actors.map((actor) => actor.x))
  })

  it('재개 직후 스텝의 입력은 광고 묶음과 다른 step 번호로 기록되고 replay가 같은 결과를 낸다', async () => {
    const story: BroadcastInput = { type: 'direct', actorId: 'june', directiveId: 'story' }
    const broadcast = await adThenResume([story])

    expect(broadcast.inputLog()).toEqual([
      { step: AD_STEP, input: { type: 'ad', effects: ['setup', 'relief'] } },
      { step: AD_STEP + 1, input: story },
    ])
    const view = broadcast.view()
    expect(view.step).toBe(TOTAL_STEPS)
    expect(await replay(realSetup(), broadcast.inputLog(), TOTAL_STEPS)).toEqual(view)
  })

  it('재개 직후 switch도 replay가 같은 결과를 낸다(대조)', async () => {
    const broadcast = await adThenResume([{ type: 'switch', cameraId: 'close' }])
    expect(broadcast.inputLog().map(({ step }) => step)).toEqual([AD_STEP, AD_STEP + 1])
    expect(await replay(realSetup(), broadcast.inputLog(), TOTAL_STEPS)).toEqual(broadcast.view())
  })

  it('코너 경계 스텝에 광고를 받으면 재개 뒤 첫 스텝에 그 코너가 시작된다', async () => {
    const broadcast = await open(setup({ staff: [], equipment: [] }))
    run(broadcast, CORNER_STEPS)
    broadcast.step([{ type: 'ad', effects: ['relief', 'reset'] }])
    broadcast.resumeFromAd()
    broadcast.step([])
    expect(broadcast.view().cornerIndex).toBe(1)
    expect(
      broadcast
        .events()
        .filter((event) => event.sourceId === 'mo' && event.kind === 'noise' && event.causeId === null)
        .map((event) => event.step),
    ).toEqual([CORNER_STEPS + 1])
  })

  it('마지막 스텝에 광고를 받으면 재개할 때 방송이 끝난다', async () => {
    const broadcast = await open(quietSetup())
    run(broadcast, BROADCAST_STEPS - 1)
    broadcast.step([{ type: 'ad', effects: ['relief', 'reset'] }])
    expect(broadcast.view()).toMatchObject({ phase: 'adBreak', step: BROADCAST_STEPS })
    broadcast.resumeFromAd()
    expect(broadcast.view()).toMatchObject({ phase: 'ended', step: BROADCAST_STEPS })
  })

  it('광고 중에는 시청자가 그대로이고 복귀할 때 일부가 이탈한다(spec 5.5)', async () => {
    const broadcast = await open(quietSetup())
    run(broadcast, 10)
    const before = broadcast.view().viewers
    broadcast.step([{ type: 'ad', effects: ['relief', 'reset'] }])
    expect(broadcast.view().viewers).toBe(before)
    broadcast.resumeFromAd()
    expect(broadcast.view().viewers).toBeCloseTo(before * (1 - AD_VIEWER_LOSS))
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
      expect.objectContaining({ index: 0, step: 0, text: '렉스 쪽에서 소리가 난다', depth: 1 }),
    ])
    expect(broadcast.view().cornerIndex).toBe(0)

    run(broadcast, CORNER_STEPS)
    const view = broadcast.view()
    expect(view.cornerIndex).toBe(1)
    const indexes = view.log.map((line) => line.index)
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
    expect(new Set(indexes).size).toBe(indexes.length)
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

  it('극 중 60분 쇼(배율 20)에서는 150스텝 뒤 silence 강도 1이 생긴다', async () => {
    const broadcast = await open(quietSetup({ show: { ...SHOW, showMinutes: 60 } }))
    run(broadcast, 149)
    expect(silences(broadcast)).toEqual([])
    run(broadcast, 1)
    expect(silences(broadcast).map((event) => event.intensity)).toEqual([1])
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
    expect(broadcast.view().actors[0]).toMatchObject({
      walkedOut: true,
      departed: false,
      directivesLeft: 0,
    })

    // 모는 렉스의 분노에 반응하지만 원인(렉스)이 이탈했으므로 대상은 없다
    broadcast.step([])
    const moReaction = broadcast
      .events()
      .find((event) => event.step === 11 && event.sourceId === 'mo')
    expect(moReaction).toMatchObject({ kind: 'anger', targetId: null, intensity: 3 })

    run(broadcast, 2 * STEPS_PER_SECOND - 2)
    expect(broadcast.view().actors.find((actor) => actor.id === 'rex')).toMatchObject({
      walkedOut: true,
      departed: false,
    })
    run(broadcast, 2)
    const rex = broadcast.view().actors.find((actor) => actor.id === 'rex')
    expect(rex).toMatchObject({ walkedOut: true, departed: true, onAir: false })

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

describe('3D 이동', () => {
  it('dash는 대상 쪽 바닥 방향(x와 z 둘 다)으로 움직인다', async () => {
    const dasher = performer({ id: 'rex', tags: ['host'], directives: [SHOUT, CALM] })
    const diagonalShow: ShowDef = {
      ...SHOW,
      homeSpots: [
        { x: 4, z: 2 },
        { x: 8, z: 6 },
      ],
    }
    const broadcast = await open(
      quietSetup({ show: diagonalShow, performers: [dasher, performer({ id: 'mo', tags: ['guest'] })] }),
    )
    run(broadcast, 1)
    const rexOf = () => {
      const rex = broadcast.view().actors.find((actor) => actor.id === 'rex')
      if (rex === undefined) throw new Error('렉스가 없습니다.')
      return rex
    }
    const start = rexOf()
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'shout' }])
    run(broadcast, 5)
    const end = rexOf()
    const dx = end.x - start.x
    const dz = end.z - start.z
    expect(dx).toBeGreaterThan(0.2)
    expect(dz).toBeGreaterThan(0.2)
    // 대상이 (+4, +4) 쪽이므로 x와 z로 같은 만큼 움직인다
    expect(dz / dx).toBeCloseTo(1, 1)
  })

  it('이탈한 출연자는 exit 쪽 바닥 방향으로 걸어가 WALKOUT_SECONDS 뒤 사라진다', async () => {
    const walkoutSteps = Math.round(WALKOUT_SECONDS * STEPS_PER_SECOND)
    const lowRex = performer({ id: 'rex', shortName: '렉스', tolerance: 'low', tags: ['host'] })
    // 렉스의 home (4, 4)에서 출구까지 +z 방향으로 곧게 걷는다
    const frontExitShow: ShowDef = { ...SHOW, exit: { x: 4, z: 9.5 } }
    const broadcast = await open(
      quietSetup({ show: frontExitShow, performers: [lowRex, performer({ id: 'mo', tags: ['guest'] })] }),
    )
    const rexOf = () => {
      const rex = broadcast.view().actors.find((actor) => actor.id === 'rex')
      if (rex === undefined) throw new Error('렉스가 없습니다.')
      return rex
    }
    run(broadcast, 1)
    const walkoutStep = broadcast.currentStep
    const calm: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'calm' }
    broadcast.step([calm, calm, calm])
    run(broadcast, STEPS_PER_SECOND / 2)

    const walking = rexOf()
    expect(walking).toMatchObject({ walkedOut: true, departed: false })
    expect(walking.z).toBeGreaterThan(5)
    expect(walking.x).toBeCloseTo(4, 1)

    run(broadcast, walkoutStep + walkoutSteps - broadcast.currentStep)
    expect(rexOf().departed).toBe(false)
    run(broadcast, 1)
    expect(rexOf()).toMatchObject({ walkedOut: true, departed: true, onAir: false })
  })
})

describe('송출 가림', () => {
  const WALL: EquipmentDef = {
    id: 'wall',
    name: '세트 벽',
    kind: 'setWall',
    // 와이드(8, 6, 9.5)와 렉스(8, 4) 사이. 시선은 z 5.5에서 높이 약 2.3m로 벽(높이 3m)에 걸린다.
    position: { x: 8, y: 0, z: 5.5 },
    breakAt: 3,
    onBreak: [],
  }
  const LAUGH = directive('laugh', {
    pose: 'laugh',
    emits: [{ kind: 'laughter', intensity: 1, target: 'none' }],
  })
  const wallShow: ShowDef = {
    ...SHOW,
    homeSpots: [
      { x: 8, z: 4 },
      { x: 12, z: 4 },
    ],
  }
  const laughers = [
    performer({ id: 'rex', tags: ['host'], directives: [LAUGH, CALM] }),
    performer({ id: 'mo', tags: ['guest'], directives: [LAUGH, CALM] }),
  ]
  const onAirOf = (broadcast: Broadcast) =>
    Object.fromEntries(broadcast.view().actors.map((actor) => [actor.id, actor.onAir]))

  it('세트 벽이 와이드와 출연자 사이를 막으면 그 출연자의 현상은 송출로 세지 않는다', async () => {
    const broadcast = await open(quietSetup({ show: wallShow, performers: laughers, equipment: [WALL] }))
    run(broadcast, 2)
    expect(onAirOf(broadcast)).toEqual({ rex: false, mo: true })

    const before = broadcast.view().viewers
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'laugh' }])
    expect(broadcast.view().viewers).toBe(before)
    broadcast.step([{ type: 'direct', actorId: 'mo', directiveId: 'laugh' }])
    expect(broadcast.view().viewers).toBeGreaterThan(before)
  })

  it('대조: 벽이 없으면 같은 자리의 출연자도 잡힌다', async () => {
    const broadcast = await open(quietSetup({ show: wallShow, performers: laughers }))
    run(broadcast, 2)
    expect(onAirOf(broadcast)).toEqual({ rex: true, mo: true })
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

  it('relief와 setup: 게이지 −25, 출연자 추가, 복귀 때 시청자 −10%, 이후 연쇄 깊이는 1부터', async () => {
    const broadcast = await open(adSetup())
    broadcast.step([flash])
    const before = broadcast.view()
    expect(before.gauges.sexual).toBe(54)

    broadcast.step([{ type: 'ad', effects: ['relief', 'setup'] }])
    const during = broadcast.view()
    expect(during.phase).toBe('adBreak')
    // Ruling 36: 광고 스텝도 번호 하나를 쓴다
    expect(during.step).toBe(2)
    expect(during.adsLeft).toBe(0)
    expect(during.benchLeft).toBe(0)
    expect(during.gauges.sexual).toBe(54 - AD_GAUGE_RELIEF)
    expect(during.viewers).toBe(before.viewers)
    expect(during.actors.map((actor) => [actor.id, actor.x])).toEqual([
      ['rex', 4],
      ['mo', 6.5],
      ['june', 9.5],
    ])

    broadcast.step([])
    expect(broadcast.view()).toEqual(during)

    broadcast.resumeFromAd()
    expect(broadcast.view().viewers).toBeCloseTo(before.viewers * (1 - AD_VIEWER_LOSS))
    broadcast.step([])
    expect(laughs(broadcast).length).toBeGreaterThan(0)
    expect(laughs(broadcast)[0]).toMatchObject({ step: 2, sourceId: 'mo', depth: 1 })
    expect(laughs(broadcast)[0].causeId).not.toBeNull()

    const again: BroadcastInput = { type: 'ad', effects: ['relief', 'reset'] }
    expect(() => broadcast.step([again])).toThrow('남은 광고')
  })

  it('광고 앞 사고에 놀란 스태프 줄은 광고 경계를 넘지 않아 깊이 1이다(Ruling 9)', async () => {
    const startled: StaffDef = {
      ...CAMERA_OPERATOR,
      reactions: [reaction({ kind: 'exposure', min: 1, scope: 'perceived' }, { pose: 'panic', emits: [] })],
    }
    const panicLine = (broadcast: Broadcast) =>
      broadcast.view().log.find((line) => line.text === '카메라 감독이 놀라 카메라를 휘둘렀다')

    // 대조: 광고가 없으면 원인(깊이 1) 다음 깊이 2다
    const direct = await open(adSetup({ staff: [startled] }))
    direct.step([flash])
    direct.step([])
    expect(panicLine(direct)).toMatchObject({ depth: 2 })

    const broadcast = await open(adSetup({ staff: [startled] }))
    broadcast.step([flash])
    broadcast.step([{ type: 'ad', effects: ['relief', 'setup'] }])
    broadcast.resumeFromAd()
    broadcast.step([])
    expect(panicLine(broadcast)).toMatchObject({ depth: 1 })
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

describe('로그 묶기 조건', () => {
  it('문장과 줄 종류가 같아도 깊이가 다르면 묶지 않는다', async () => {
    // 렉스가 스스로 민망한 모습을 드러내고(깊이 1), 모가 그 원인(렉스)을 겨눠 같은 문장의 사건을 낸다(깊이 2)
    const exposeSelf = directive('expose', {
      pose: 'idle',
      emits: [{ kind: 'exposure', intensity: 1, target: 'self' }],
    })
    const exposer = performer({ id: 'rex', shortName: '렉스', tags: ['host'], directives: [exposeSelf] })
    const echo = performer({
      id: 'mo',
      shortName: '모',
      tags: ['guest'],
      reactions: [
        reaction(
          { kind: 'exposure', min: 1, scope: 'perceived' },
          { pose: 'idle', emits: [{ kind: 'exposure', intensity: 1, target: 'cause' }] },
        ),
      ],
    })
    const broadcast = await open(
      quietSetup({ show: { ...SHOW, rating: 'TV-MA' }, performers: [exposer, echo] }),
    )
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'expose' }])
    broadcast.step([])

    const lines = broadcast.view().log.filter((line) => line.text === '렉스가 민망한 모습을 드러냈다!')
    expect(lines.map(({ depth, repeat }) => ({ depth, repeat }))).toEqual([
      { depth: 1, repeat: 1 },
      { depth: 2, repeat: 1 },
    ])
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

  /**
   * 렉스의 코너 소음(스텝 0)을 뺀 무대. 있으면 스텝 10의 지시가 그 소음을 이어받아(지시 이어받기)
   * 지시가 연쇄의 뿌리가 되지 않는다.
   */
  const shoutSetup = () =>
    setup({ performers: [{ ...REX, reactions: [] }, MO], staff: [], equipment: [] })

  it('반응은 다음 스텝에 한 단계씩 전파되고 longestChain이 그 연쇄를 돌려준다', async () => {
    const broadcast = await open(shoutSetup())
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
    // 최근 현상에도 출처와 대상이 실린다(렌더러의 분노 화살표)
    const anger = broadcast.events().at(-1)
    expect(
      broadcast.view().recentPhenomena.find((item) => item.id === anger?.id),
    ).toMatchObject({ kind: 'anger', sourceId: 'rex', targetId: 'mo' })

    broadcast.step([])
    expect(fromMo(11)).toMatchObject({ kind: 'anger', intensity: 3, targetId: 'rex', depth: 2 })
    const chain = broadcast.longestChain()
    expect(chain.map((line) => line.depth)).toEqual([1, 2])
    expect(chain[0].text).toBe('렉스가 모에게 버럭 화를 낸다')
    expect(chain[1].text).toBe('모가 욕설을 했다! (삐—)')
  })

  it('summary.rootLine은 가장 깊은 연쇄의 원인 없는 첫 사건 줄이다', async () => {
    const broadcast = await open(shoutSetup())
    expect(broadcast.summary().rootLine).toBeNull()
    run(broadcast, 10)
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'shout' }])
    broadcast.step([])
    expect(broadcast.summary().maxChainDepth).toBe(2)
    expect(broadcast.summary().rootLine).toEqual({ step: 10, text: '렉스가 모에게 버럭 화를 낸다' })
  })

  it('longestChain은 광고 뒤 사건만 담는다', async () => {
    const broadcast = await open(shoutSetup())
    run(broadcast, 10)
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'shout' }])
    broadcast.step([])
    broadcast.step([{ type: 'ad', effects: ['relief', 'reset'] }])
    broadcast.resumeFromAd()
    run(broadcast, 30)
    const chain = broadcast.longestChain()
    expect(chain.map((line) => line.depth)).toEqual([1, 2])
    expect(chain.every((line) => line.step <= 11)).toBe(true)
    expect(broadcast.summary().rootLine?.step).toBe(10)
  })
})

describe('장비 파손 연쇄', () => {
  // 조명(8, 6, 4) 바로 아래에서 수직으로 뛰는 출연자. 접촉 때 상대 속도가 강도 2에 이른다.
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
      show: {
        ...SHOW,
        rating: 'TV-MA',
        homeSpots: [
          { x: 8, z: 4 },
          { x: 6.5, z: 4 },
          { x: 13, z: 4 },
        ],
      },
      performers: [
        performer({ id: 'jumper', directives: [JUMP] }),
        // 어둠 원(중심 (8, 4), 반경 2) 안과 밖
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
    expect(broadcast.view().darkZones).toEqual([])

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
    expect(darkness).toMatchObject({ intensity: 2, x: 8, y: STANDING_Y, z: 4 })
    // 어둠 원은 view에 실려 방송이 끝날 때까지 남는다(렌더러가 바닥에 칠한다)
    expect(broadcast.view().darkZones).toEqual([{ x: 8, z: 4, radius: 2 }])

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
        z: 4,
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
    // 광고 스텝(adStep)에는 세지 않고 재개 뒤 adStep + 1부터 다시 센다(Ruling 36).
    // reset이 없었다면 첫 소음은 NOISE_STEPS - 1 스텝에 난다
    expect(fromAudience(broadcast, 'noise').map((event) => event.step)).toEqual([
      adStep + NOISE_STEPS,
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
    // home (4, 4)는 관객 구역 중앙(1.5, 4)에서 SIGHT_RADIUS 안이다
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
        z: 4,
        causeId: first.id,
        depth: 2,
        step: 1,
      }),
    ])

    // 웃음은 낸 다음 스텝에 판정된다. step contagionStep + C - 2(첫 전염 뒤 C - 2)에 낸 웃음은
    // step contagionStep + C - 1에 판정되어, 첫 전염과의 간격이 C - 1이라 쿨다운에 막힌다
    // (C = COOLDOWN_STEPS). 자기 웃음에도 반응하지 않는다.
    const contagionStep = 1
    run(broadcast, contagionStep + COOLDOWN_STEPS - 2 - broadcast.currentStep)
    broadcast.step([laugh])
    broadcast.step([laugh])
    expect(broadcast.currentStep).toBe(contagionStep + COOLDOWN_STEPS)
    expect(fromAudience(broadcast, 'laughter')).toHaveLength(1)

    // step contagionStep + C - 1에 낸 웃음은 step contagionStep + C에 판정되어,
    // 간격이 정확히 C라 다시 전염된다
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
        show: {
          ...SHOW,
          homeSpots: [
            { x: 4, z: 4 },
            { x: 12, z: 4 },
          ],
        },
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

describe('클로즈업 추적과 스태프 복구', () => {
  const TRACKING_SHOW: ShowDef = {
    ...SHOW,
    cameras: SHOW.cameras.map((entry) => (entry.id === 'close' ? { ...entry, tracking: true } : entry)),
  }
  const CLOSE_POSITION = { x: 2, z: 4 }
  const lowPerformer = (id: string, presence: 1 | 2 | 3, tags: string[] = []) =>
    performer({ id, shortName: id, presence, tolerance: 'low', tags })
  const calm = (actorId: string): BroadcastInput => ({ type: 'direct', actorId, directiveId: 'calm' })
  const track = (actorId: string): BroadcastInput => ({ type: 'track', cameraId: 'close', actorId })

  it('토크쇼 고정 라인업이면 클로즈업의 시작 대상은 첫 코너 host 태그 출연자다', async () => {
    const view = (await open({ show: TALK_SHOW, ...LINEUP, seed: 7 })).view()
    const host = LINEUP.performers.find((entry) => entry.tags.includes('host'))
    expect(view.cameraTargets).toEqual({ wide: null, close: host?.id, audienceCam: null })
  })

  it('track 입력은 대상을 바꾸고 내성과 누적 피로를 쓰지 않는다', async () => {
    const broadcast = await open(quietSetup({ show: TRACKING_SHOW }))
    const before = broadcast.view()
    expect(before.cameraTargets.close).toBe('rex')

    broadcast.step([track('mo')])
    const view = broadcast.view()
    expect(view.cameraTargets.close).toBe('mo')
    expect(view.fatigue).toBe(before.fatigue)
    expect(view.actors.map((actor) => actor.directivesLeft)).toEqual(
      before.actors.map((actor) => actor.directivesLeft),
    )
    const mo = view.actors.find((actor) => actor.id === 'mo')
    expect(mo).toBeDefined()
    if (mo === undefined) return
    expect(view.cameraAngles.close).toBeCloseTo(yawBetween(CLOSE_POSITION, mo), 3)
    expect(broadcast.inputLog()).toEqual([{ step: 0, input: track('mo') }])
  })

  it('대상이 이탈하면 startTag가 아니라 존재감이 가장 높은 남은 출연자로, 모두 이탈하면 null로 바뀐다(R11)', async () => {
    // ann도 host 태그지만 재선택은 존재감 규칙만 쓰므로 bo(존재감 3)가 먼저다.
    const performers = [
      lowPerformer('rex', 1, ['host']),
      lowPerformer('ann', 1, ['host']),
      lowPerformer('bo', 3),
    ]
    const broadcast = await open(quietSetup({ show: TRACKING_SHOW, performers }))
    expect(broadcast.view().cameraTargets.close).toBe('rex')

    broadcast.step([calm('rex'), calm('rex'), calm('rex')])
    expect(broadcast.view().cameraTargets.close).toBe('bo')

    broadcast.step([calm('bo'), calm('bo'), calm('bo')])
    expect(broadcast.view().cameraTargets.close).toBe('ann')

    broadcast.step([calm('ann'), calm('ann'), calm('ann')])
    expect(broadcast.view().cameraTargets.close).toBeNull()
    expect(() => run(broadcast, 5 * STEPS_PER_SECOND)).not.toThrow()
    expect(broadcast.view().cameraAngles.close).toBe(0)
  })

  it('이탈한 출연자나 추적 카메라가 아닌 카메라로의 track은 입력 검증 오류다', async () => {
    const performers = [lowPerformer('rex', 1, ['host']), lowPerformer('mo', 1)]
    const broadcast = await open(quietSetup({ show: TRACKING_SHOW, performers }))
    expect(() => broadcast.step([calm('rex'), calm('rex'), calm('rex'), track('rex')])).toThrow(
      '이탈한 출연자',
    )
    broadcast.step([calm('rex'), calm('rex'), calm('rex')])
    expect(() => broadcast.step([track('rex')])).toThrow('이탈한 출연자')
    expect(() => broadcast.step([track('ghost')])).toThrow('무대에 없는 출연자')
    expect(() => broadcast.step([{ type: 'track', cameraId: 'wide', actorId: 'mo' }])).toThrow(
      '추적 카메라가 아닙니다',
    )
  })

  it('dropInvalidQueuedInputs는 검증과 같은 기준으로 이탈한(묶음 안에서 이탈할) 출연자 입력만 뺀다', async () => {
    const performers = [lowPerformer('rex', 1, ['host']), lowPerformer('mo', 1)]
    const broadcast = await open(quietSetup({ show: TRACKING_SHOW, performers }))
    const batch = [calm('rex'), calm('rex'), calm('rex'), track('rex'), calm('rex'), track('mo')]
    const kept = broadcast.dropInvalidQueuedInputs(batch)
    expect(kept).toEqual([calm('rex'), calm('rex'), calm('rex'), track('mo')])
    // 무대에 없는 id처럼 다른 이유로 틀린 입력은 남겨 검증이 잡게 한다
    expect(broadcast.dropInvalidQueuedInputs([track('ghost')])).toEqual([track('ghost')])
    // 상태를 바꾸지 않고, 남은 묶음은 throw하지 않는다
    expect(broadcast.inputLog()).toEqual([])
    expect(() => broadcast.step(kept)).not.toThrow()
    expect(broadcast.view().cameraTargets.close).toBe('mo')
    expect(broadcast.dropInvalidQueuedInputs([calm('rex'), track('rex')])).toEqual([])
  })

  it('스태프 view는 놀람, 복구 중, 평상시를 보이고 복구가 끝나면 자리를 잡았다는 로그가 남는다', async () => {
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
    const broadcast = await open(
      setup({ show: TRACKING_SHOW, performers: [shouter, MO], equipment: [] }),
    )
    const modes = new Set<string>()
    const texts = new Set<string>()
    for (let i = 0; i < 300; i++) {
      broadcast.step([])
      const view = broadcast.view()
      modes.add(view.staff[0].mode)
      for (const line of view.log) texts.add(line.text)
    }
    expect([...modes]).toEqual(expect.arrayContaining(['startled', 'recovering', 'normal']))
    expect(texts).toContain('카메라 감독이 놀라 카메라를 휘둘렀다')
    expect(texts).toContain('카메라 감독이 자리를 잡았다')
    expect(broadcast.view().staff).toEqual([
      {
        id: 'cammy',
        name: '겁쟁이 카메라 감독',
        cameraId: 'close',
        mode: 'normal',
        recoveryProgress: 1,
        misfireChance: 0,
        x: 2,
        y: 1,
        z: 4,
      },
    ])
  })

  it('switch, track, direct, directStaff, ad가 섞이고 놀람과 복구가 일어나는 방송을 replay하면 같다', async () => {
    const shouter = performer({
      id: 'rex',
      shortName: '렉스',
      tags: ['host'],
      reactions: [
        reaction(
          { kind: 'corner', tag: 'host' },
          { pose: 'angry', emits: [{ kind: 'noise', intensity: 2, target: 'none' }] },
        ),
      ],
      directives: [CALM, SHOUT],
    })
    const replaySetup = () =>
      setup({ show: TRACKING_SHOW, performers: [shouter, MO], equipment: [], seed: 11 })
    const INPUTS = new Map<number, BroadcastInput[]>([
      [5, [{ type: 'switch', cameraId: 'close' }]],
      [10, [track('mo')]],
      [60, [{ type: 'direct', actorId: 'rex', directiveId: 'shout' }]],
      [250, [{ type: 'directStaff', staffId: 'cammy', directiveId: 'audience' }]],
      [300, [{ type: 'ad', effects: ['relief', 'reset'] }]],
      [350, [{ type: 'directStaff', staffId: 'cammy', directiveId: 'calm' }]],
      [400, [track('rex')]],
    ])
    const first = await open(replaySetup())
    const modes = new Set<string>()
    for (let i = 0; i < 600; i++) {
      run(first, 1, INPUTS)
      modes.add(first.view().staff[0].mode)
    }
    expect([...modes]).toEqual(expect.arrayContaining(['startled', 'recovering', 'normal']))

    const view = first.view()
    expect(await replay(replaySetup(), first.inputLog(), 600)).toEqual(view)

    const byStep = new Map<number, BroadcastInput[]>()
    for (const { step, input } of first.inputLog()) {
      byStep.set(step, [...(byStep.get(step) ?? []), input])
    }
    const second = await open(replaySetup())
    run(second, 600, byStep)
    expect(second.summary()).toEqual(first.summary())
    expect(second.view()).toEqual(view)
  })

  const operatorWith = (aims: StaffDef['directives'][number]['aim'][]): StaffDef => ({
    ...CAMERA_OPERATOR,
    directives: aims.map((aim) => ({ id: aim, label: aim, expect: aim, aim })),
  })

  it('스태프 view의 엇나감 확률은 스태프 피로를 따른다(판단 카드용)', async () => {
    const broadcast = await open(
      quietSetup({ show: TRACKING_SHOW, staff: [operatorWith(['audience', 'default'])] }),
    )
    expect(broadcast.view().staff[0].misfireChance).toBe(0)
    broadcast.step([{ type: 'directStaff', staffId: 'cammy', directiveId: 'audience' }])
    expect(broadcast.view().staff[0].misfireChance).toBeCloseTo(STAFF_FATIGUE_MISFIRE_PER_POINT)
  })

  it("'관객석' 지시 뒤 track을 받으면 지시 방향을 지우고 새 대상을 따라간다(R7)", async () => {
    const broadcast = await open(
      quietSetup({ show: TRACKING_SHOW, staff: [operatorWith(['audience', 'default'])] }),
    )
    broadcast.step([{ type: 'directStaff', staffId: 'cammy', directiveId: 'audience' }])
    const rex = broadcast.view().actors[0]
    expect(broadcast.view().cameraAngles.close).not.toBeCloseTo(yawBetween(CLOSE_POSITION, rex), 1)

    broadcast.step([track('mo')])
    const view = broadcast.view()
    const mo = view.actors.find((actor) => actor.id === 'mo')
    expect(mo).toBeDefined()
    if (mo === undefined) return
    expect(view.cameraAngles.close).toBeCloseTo(yawBetween(CLOSE_POSITION, mo), 3)
  })

  it("'관객석' 지시 뒤 대상은 그대로지만 조준 상태가 directed이고, track 뒤 tracking으로 돌아온다", async () => {
    const broadcast = await open(
      quietSetup({ show: TRACKING_SHOW, staff: [operatorWith(['audience', 'default'])] }),
    )
    expect(broadcast.view().cameraAimModes).toEqual({
      wide: 'fixed',
      close: 'tracking',
      audienceCam: 'fixed',
    })

    broadcast.step([{ type: 'directStaff', staffId: 'cammy', directiveId: 'audience' }])
    const directed = broadcast.view()
    expect(directed.cameraTargets.close).toBe('rex')
    expect(directed.cameraAimModes.close).toBe('directed')

    broadcast.step([track('rex')])
    expect(broadcast.view().cameraAimModes.close).toBe('tracking')
  })

  it('스태프가 놀라 있는 동안 조준 상태는 startled이고 복구가 끝나면 원래대로 돌아온다', async () => {
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
    const broadcast = await open(
      setup({ show: TRACKING_SHOW, performers: [shouter, MO], equipment: [] }),
    )
    run(broadcast, 2)
    expect(broadcast.view().staff[0].mode).toBe('startled')
    expect(broadcast.view().cameraAimModes.close).toBe('startled')
    run(broadcast, 10 * STEPS_PER_SECOND)
    expect(broadcast.view().staff[0].mode).toBe('normal')
    expect(broadcast.view().cameraAimModes.close).toBe('tracking')
  })

  it('광고 reset은 스태프 놀람을 평상시로 되돌린다(R12)', async () => {
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
    expect(broadcast.view().staff[0].mode).toBe('startled')

    run(broadcast, 1, new Map([[2, [{ type: 'ad', effects: ['relief', 'reset'] }]]]))
    expect(broadcast.view().staff[0]).toMatchObject({ mode: 'normal', recoveryProgress: 1 })
    expect(broadcast.view().cameraAngles.close).toBe(0)
  })

  it("'가장 가까운 출연자' 지시를 받았는데 남은 출연자가 없으면 놀람을 끝내고 기준 방향으로 돌아온다", async () => {
    const performers = [lowPerformer('rex', 1, ['host']), lowPerformer('mo', 1)]
    const broadcast = await open(
      setup({ performers, staff: [operatorWith(['nearestPerformer'])], equipment: [] }),
    )
    // 둘 다 이탈한다. 이탈의 소음(강도 2)에 카메라 감독이 놀란다.
    broadcast.step([calm('rex'), calm('rex'), calm('rex'), calm('mo'), calm('mo'), calm('mo')])
    broadcast.step([])
    expect(broadcast.view().staff[0].mode).toBe('startled')
    expect(broadcast.view().cameraAngles.close).not.toBe(0)

    broadcast.step([{ type: 'directStaff', staffId: 'cammy', directiveId: 'nearestPerformer' }])
    expect(broadcast.view().staff[0].mode).toBe('normal')
    expect(broadcast.view().cameraAngles.close).toBe(0)
  })
})

describe('판단 정보 view', () => {
  const NOISE = directive('noise', {
    pose: 'idle',
    emits: [{ kind: 'noise', intensity: 1, target: 'none' }],
  })
  const FLASH3 = directive('flash3', {
    pose: 'laugh',
    emits: [{ kind: 'exposure', intensity: 3, target: 'self' }],
  })
  const directRex = (directiveId: string): BroadcastInput => ({
    type: 'direct',
    actorId: 'rex',
    directiveId,
  })
  const infoSetup = (overrides: Partial<BroadcastSetup> = {}) =>
    quietSetup({
      show: { ...SHOW, rating: 'TV-MA' },
      performers: [
        performer({
          id: 'rex',
          shortName: '렉스',
          tags: ['host'],
          tolerance: 'max',
          misfire: 'overdo',
          directives: [CALM, NOISE, FLASH3],
        }),
        performer({ id: 'mo', shortName: '모', tags: ['guest'] }),
      ],
      ...overrides,
    })
  const rexView = (broadcast: Broadcast) => {
    const found = broadcast.view().actors.find((actor) => actor.id === 'rex')
    if (found === undefined) throw new Error('rex가 없습니다.')
    return found
  }

  it('엇나감 확률은 개입한 만큼 오르고 misfire never는 0이다', async () => {
    const broadcast = await open(infoSetup())
    expect(rexView(broadcast).misfireChance).toBe(0)
    broadcast.step([directRex('calm')])
    broadcast.step([directRex('calm')])
    expect(rexView(broadcast).misfireChance).toBeCloseTo(2 * FATIGUE_MISFIRE_PER_POINT)
    const mo = broadcast.view().actors.find((actor) => actor.id === 'mo')
    expect(mo?.misfireChance).toBe(0)
  })

  it('view를 읽어도 결과가 달라지지 않는다(미리보기는 rng를 쓰지 않는다)', async () => {
    const plain = await open(infoSetup())
    const peeked = await open(infoSetup())
    for (let i = 0; i < 40; i++) {
      const inputs: BroadcastInput[] = i % 10 === 0 ? [directRex('noise')] : []
      plain.step(inputs)
      peeked.step(inputs)
      peeked.view()
    }
    expect(peeked.events()).toEqual(plain.events())
    expect(peeked.view().log).toEqual(plain.view().log)
  })

  it('물리 접촉이 일어나는 긴 방송에서도 매 스텝 view를 읽은 실행과 읽지 않은 실행이 같다', async () => {
    const STEPS = 2400
    const trackingShow: ShowDef = {
      ...SHOW,
      cameras: SHOW.cameras.map((entry) =>
        entry.id === 'close' ? { ...entry, tracking: true } : entry,
      ),
    }
    const longSetup = () => setup({ show: trackingShow })
    const charge: BroadcastInput = { type: 'direct', actorId: 'mo', directiveId: 'charge' }
    const shout: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'shout' }
    const inputs = new Map<number, BroadcastInput[]>([
      [20, [{ type: 'switch', cameraId: 'close' }]],
      [40, [charge]],
      [200, [{ type: 'directStaff', staffId: 'cammy', directiveId: 'audience' }]],
      [260, [{ type: 'track', cameraId: 'close', actorId: 'mo' }]],
      [400, [shout, { type: 'switch', cameraId: 'wide' }]],
      [700, [charge, { type: 'directStaff', staffId: 'cammy', directiveId: 'calm' }]],
      [1100, [{ type: 'track', cameraId: 'close', actorId: 'rex' }]],
      [1400, [charge, { type: 'switch', cameraId: 'audienceCam' }]],
      [1900, [shout, { type: 'directStaff', staffId: 'cammy', directiveId: 'audience' }]],
    ])
    const plain = await open(longSetup())
    const peeked = await open(longSetup())
    for (let step = 0; step < STEPS && plain.phase !== 'ended'; step++) {
      const batch = inputs.get(step) ?? []
      plain.step(batch)
      peeked.step(batch)
      peeked.view()
      if (plain.phase === 'adBreak') plain.resumeFromAd()
      if (peeked.phase === 'adBreak') peeked.resumeFromAd()
    }
    // 출연자끼리나 출연자와 장비가 부딪힌 접촉(바닥 충돌 제외)이 실제로 일어났다
    const contacts = plain
      .events()
      .filter((event) => event.kind === 'impact' && event.targetId !== null)
    expect(contacts.length).toBeGreaterThan(0)
    expect(JSON.stringify(peeked.view())).toBe(JSON.stringify(plain.view()))
    expect(peeked.events()).toEqual(plain.events())
    expect(peeked.inputLog()).toEqual(plain.inputLog())
  })

  it('최근 현상은 생긴 스텝부터 90스텝 들어 있고 그 뒤에 빠지며 문구는 로그와 같다', async () => {
    const displaySteps = Math.round(PHENOMENON_DISPLAY_SECONDS * STEPS_PER_SECOND)
    expect(displaySteps).toBe(90)
    const broadcast = await open(infoSetup())
    broadcast.step([directRex('noise')])
    const noise = broadcast.events().find((event) => event.kind === 'noise')
    if (noise === undefined) throw new Error('소음이 생기지 않았습니다.')
    const findShown = () => broadcast.view().recentPhenomena.find((item) => item.id === noise.id)

    const { x, y, z } = noise
    expect(findShown()).toMatchObject({
      kind: 'noise',
      intensity: 1,
      sourceId: noise.sourceId,
      targetId: noise.targetId,
      x,
      y,
      z,
    })
    const logLine = broadcast.view().log.find((line) => line.eventId === noise.id)
    expect(findShown()?.text).toBe(logLine?.text)

    run(broadcast, displaySteps - 1)
    expect(broadcast.currentStep).toBe(displaySteps)
    expect(findShown()).toBeDefined()
    expect(findShown()?.ageSeconds).toBeCloseTo(PHENOMENON_DISPLAY_SECONDS)
    run(broadcast, 1)
    expect(findShown()).toBeUndefined()
  })

  it('silence와 gaze는 최근 현상에서 뺀다', async () => {
    const broadcast = await open(quietSetup())
    run(broadcast, 8 * STEPS_PER_SECOND)
    const kinds = broadcast.events().map((event) => event.kind)
    expect(kinds).toContain('silence')
    const shown = broadcast.view().recentPhenomena.map((item) => item.kind)
    expect(shown).not.toContain('silence')
    expect(shown).not.toContain('gaze')
  })

  it('시청자 추세는 강도 3 사고가 송출된 다음 1초 동안 1이고 변화가 없으면 0이다', async () => {
    const broadcast = await open(infoSetup())
    expect(broadcast.view().viewersTrend).toBe(0)
    broadcast.step([directRex('flash3')])
    expect(broadcast.view().viewers).toBeGreaterThan(500)
    expect(broadcast.view().viewersTrend).toBe(1)
  })

  it('시청자가 줄면 추세가 -1이다', async () => {
    const broadcast = await open(infoSetup())
    broadcast.step([directRex('flash3')])
    // 광고 복귀 때 시청자 10%가 빠진다. 광고 스텝 뒤 1초가 지나지 않았으므로 직전 값과 비교된다.
    broadcast.step([{ type: 'ad', effects: ['relief', 'reset'] }])
    broadcast.resumeFromAd()
    expect(broadcast.view().viewersTrend).toBe(-1)
  })
})

describe('카메라별 잡힌 대상', () => {
  const WALL_BETWEEN: EquipmentDef = {
    id: 'wall',
    name: '세트 벽',
    kind: 'setWall',
    position: { x: 8, y: 0, z: 5.5 },
    breakAt: 3,
    onBreak: [],
  }
  const wallShow: ShowDef = {
    ...SHOW,
    homeSpots: [
      { x: 8, z: 4 },
      { x: 12, z: 4 },
    ],
  }

  it('송출 카메라의 잡힌 출연자는 onAir 출연자와 같다(벽에 가린 출연자 제외)', async () => {
    const broadcast = await open(quietSetup({ show: wallShow, equipment: [WALL_BETWEEN] }))
    run(broadcast, 2)
    const view = broadcast.view()
    const onAirActors = view.actors.filter((actor) => actor.onAir).map((actor) => actor.id)
    const caught = (view.cameraSubjects[view.onAirCameraId] ?? []).filter((id) => id !== 'wall')
    expect(onAirActors).toEqual(['mo'])
    expect(caught).toEqual(onAirActors)
  })

  it('카메라마다 목록을 싣고 시야 안의 장비도 담는다', async () => {
    const broadcast = await open(quietSetup({ show: wallShow, equipment: [WALL_BETWEEN] }))
    run(broadcast, 2)
    const { cameraSubjects } = broadcast.view()
    expect(Object.keys(cameraSubjects).sort()).toEqual(['audienceCam', 'close', 'wide'])
    expect(cameraSubjects.wide).toContain('wall')
    // 관객석 카메라는 무대의 누구도 잡지 않고 관객석만 잡는다
    expect(cameraSubjects.audienceCam).toEqual(['audience'])
    expect(cameraSubjects.wide).not.toContain('audience')
  })

  it('세트 벽 뒤의 장비는 가려져 피드에서 빠진다', async () => {
    // 와이드(8, 6, 9.5)에서 벽(z 5.5, 높이 3m) 너머 바닥에 선 장비(중심 8, 1.5, 4)
    const behind: EquipmentDef = {
      ...WALL_BETWEEN,
      id: 'prop',
      position: { x: 8, y: 0, z: 4 },
    }
    const blocked = await open(quietSetup({ show: wallShow, equipment: [WALL_BETWEEN, behind] }))
    run(blocked, 2)
    expect(blocked.view().cameraSubjects.wide).toContain('wall')
    expect(blocked.view().cameraSubjects.wide).not.toContain('prop')

    const unblocked = await open(quietSetup({ show: wallShow, equipment: [behind] }))
    run(unblocked, 2)
    expect(unblocked.view().cameraSubjects.wide).toContain('prop')
  })

  it('view가 돌려주는 목록을 바꿔도 엔진 캐시는 그대로다', async () => {
    const broadcast = await open(quietSetup({ show: wallShow, equipment: [WALL_BETWEEN] }))
    run(broadcast, 2)
    broadcast.view().cameraSubjects.wide?.push('mutated')
    expect(broadcast.view().cameraSubjects.wide).not.toContain('mutated')
  })
})
