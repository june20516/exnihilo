import {
  AD_GAUGE_RELIEF,
  AUDIENCE_LAUGHTER_INTENSITY,
  AUDIENCE_NOISE_INTENSITY,
  AUDIENCE_NOISE_SECONDS,
  BROADCAST_STEPS,
  CORNER_STEPS,
  HABIT_REST_AFTER_ACTION_BODY_SECONDS,
  LEAP_VERTICAL_RATIO,
  LIGHT_DARKNESS_INTENSITY,
  MOTION_CAUSE_SECONDS,
  NEAR_RADIUS,
  ON_AIR_FRAME_DEPTH_RATIO,
  PHENOMENON_DISPLAY_SECONDS,
  POSE_HOLD_SECONDS,
  RATING_LIMITS,
  SILENCE_SHOW_SECONDS,
  STEP_SECONDS,
  STUDIO_DEPTH,
  STUDIO_HEIGHT,
  STUDIO_WIDTH,
  TAKEOVER_BODY_SECONDS,
  TOLERANCE_COUNT,
  VIEW_LOG_LINES,
  VIEWERS_START,
  WALK_ARRIVE_RADIUS,
  WALK_MAX_SECONDS,
  WALKOUT_INTENSITY,
  WALKOUT_SECONDS,
  WALKOUT_SPEED,
  gaugeRiskIncrease,
} from '@/content/balance'
import { GAUGE_KINDS } from '@/content/types'
import type {
  ActionDef,
  CameraDef,
  EmitDef,
  EquipmentDef,
  GaugeKind,
  Intensity,
  MoveDef,
  PerformerDef,
  Pose,
  ReactionDef,
  StaffDef,
  StaffDirectiveDef,
} from '@/content/types'
import { validateShow } from '@/content/validate'
import { createRng, nextFloat, type RngState } from '@/kit/rng'
import { BroadcastScore, inFrame, viewersTrendOf } from './broadcast'
import { CameraRig, type DirectedAim } from './cameraRig'
import { Cast, STANDING_Y, type CastMember } from './cast'
import { describeEvent, describeRootEvent, entityName, withObject, withSubject } from './describe'
import { Director, type AdEffect } from './director'
import { StudioLife, type BurstRecord, type LifeMember } from './life'
import { eventNoun } from './narration'
import { LifeActions, type ActionOptions, type ActionResult, type LineInput } from './lifeActions'
import { EventLog, isStir, type Perceiver, type PhenomenonEvent } from './phenomena'
import { PhysicsWorld, initPhysics, type Contact } from './physics'
import {
  ShowValidationError,
  type ActorView,
  type AutoSlowmo,
  type BroadcastInput,
  type BroadcastSetup,
  type BroadcastSummary,
  type BroadcastView,
  type ChainLine,
  type EquipmentView,
  type InputRecord,
  type LogLine,
  type Phase,
  type RecentPhenomenon,
  type StaffView,
  type TakeoverView,
} from './engineTypes'
import { updateGaze } from './gaze'
import { dropGoneActorInputs, validateInputs } from './inputValidation'
import { CooldownTable, cooldownKey, resolveReactions, type ReactorView } from './reactions'
import { showSecondsToSteps } from './showClock'
import {
  activeInvolvement,
  remainingTakeoverSteps,
  takeoverWindowSteps,
  updateInvolvement,
  type Involvement,
  type InvolvementMap,
} from './takeover'
import { NO_TARGET, StageLocator, type Emitter, type Target } from './targeting'
import { type FloorPoint, floorDistance, type Vec3, yawBetween } from './vec'

export * from './engineTypes'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const WALKOUT_STEPS = Math.round(WALKOUT_SECONDS / STEP_SECONDS)
const INTENSITIES: readonly Intensity[] = [1, 2, 3]
const MAX_INTENSITY: Intensity = 3
const LAST_CORNER_INDEX = 2
/** 관객 이벤트의 sourceId. validateShow가 콘텐츠 id로 쓰지 못하게 막는다(RESERVED_IDS). */
const AUDIENCE_ID = 'audience'

function secondsToSteps(seconds: number): number {
  return Math.max(1, Math.round(seconds * STEPS_PER_SECOND))
}

const AUDIENCE_NOISE_STEPS = secondsToSteps(AUDIENCE_NOISE_SECONDS)
const MOTION_CAUSE_STEPS = secondsToSteps(MOTION_CAUSE_SECONDS)
const POSE_HOLD_STEPS = secondsToSteps(POSE_HOLD_SECONDS)
const WALK_MAX_STEPS = secondsToSteps(WALK_MAX_SECONDS)
/** 출연자 지시가 연루 사고를 이어받는 창. 조정값 0이면 0(꺼짐)이다 */
const TAKEOVER_WINDOW_STEPS = takeoverWindowSteps(TAKEOVER_BODY_SECONDS, STEPS_PER_SECOND)
/** 시간이 지나면 풀리는 감정 포즈. 넘어짐·놀람은 물리나 다른 행동이 끝낸다. */
const FADING_POSES: ReadonlySet<Pose> = new Set(['angry', 'laugh'])
/** onAirFrame 목표점이 스튜디오 벽에 붙지 않게 두는 여백(m) */
const FLOOR_MARGIN = 0.5
const PHENOMENON_DISPLAY_STEPS = secondsToSteps(PHENOMENON_DISPLAY_SECONDS)
/** 행동 뒤 버릇과 터짐을 미루는 스텝(L5) */
const HABIT_REST_STEPS = secondsToSteps(HABIT_REST_AFTER_ACTION_BODY_SECONDS)

/** 관객은 고정 환경이라 콘텐츠가 아니라 balance 수치로 반응한다(spec 7.4, Ruling 17). */
const AUDIENCE_REACTIONS: ReactionDef[] = [
  {
    trigger: { kind: 'laughter', min: 1, scope: 'perceived' },
    action: {
      pose: 'laugh',
      emits: [{ kind: 'laughter', intensity: AUDIENCE_LAUGHTER_INTENSITY, target: 'none' }],
    },
  },
]

function cloneInput(input: BroadcastInput): BroadcastInput {
  return input.type === 'ad' ? { type: 'ad', effects: [...input.effects] } : { ...input }
}

type StrongEvent = PhenomenonEvent & { intensity: Intensity }

/** 강도 1 이상인 사건. 기척(강도 0)이 아니다. */
function isStrong(event: PhenomenonEvent): event is StrongEvent {
  return !isStir(event)
}

/** 방송 정적을 깨는 기척 종류. 소리 나는 것만(분노·민망함 기척은 소리가 아니다). 점수·게이지에는 여전히 들어가지 않는다 */
const SILENCE_BREAKING_STIR_KINDS: ReadonlySet<PhenomenonEvent['kind']> = new Set(['noise', 'laughter'])

/** 화면에 보이는 사고인가. gaze와 silence, 기척(강도 0)은 아니다. */
function isPhenomenonShown(event: PhenomenonEvent): event is StrongEvent {
  return event.kind !== 'gaze' && event.kind !== 'silence' && isStrong(event)
}

/** emit이 이 사건의 현상 줄을 남기는가. 기척과 silent는 줄이 없다. */
function leavesLine(event: PhenomenonEvent, silent: boolean): boolean {
  return !silent && !isStir(event)
}

/** from에서 to로 향하는 바닥 평면 단위 벡터. 같은 자리면 null. */
function floorDirection(from: FloorPoint, to: FloorPoint): FloorPoint | null {
  const distance = floorDistance(from, to)
  if (distance === 0) return null
  return { x: (to.x - from.x) / distance, z: (to.z - from.z) / distance }
}

/**
 * 생방송 한 회의 시뮬레이션. 모든 상태 변화는 BroadcastInput과 시드 rng로만 일어난다.
 * 이벤트는 생긴 다음 스텝에 반응으로 판정되므로 한 스텝에 한 단계만 전파된다.
 */
export class Broadcast {
  private readonly setup: BroadcastSetup
  private readonly physics: PhysicsWorld
  private readonly cast: Cast
  private readonly locator: StageLocator
  private readonly score: BroadcastScore
  private readonly director: Director
  /** 출연자의 감정과 버릇. 판정은 StudioLife가, 실행과 문장은 엔진이 맡는다. 난수는 따로 쓴다. */
  private readonly life: StudioLife
  private readonly lifeActions: LifeActions
  private readonly log = new EventLog()
  private readonly cooldowns = new CooldownTable()
  private readonly cameras = new Map<string, CameraDef>()
  private readonly rig: CameraRig
  private readonly staff = new Map<string, StaffDef>()
  private readonly equipment = new Map<string, EquipmentDef>()
  /** 부서진 장비 id → 부순 충격 이벤트. 떨어지는 장비가 일으킨 충격의 원인이 된다. */
  private readonly brokenEquipment = new Map<string, PhenomenonEvent>()
  private readonly darkZones: NonNullable<EquipmentDef['darknessZone']>[] = []
  private readonly benchQueue: PerformerDef[]
  private readonly names: Record<string, string> = {}

  private rng: RngState
  private stepCount = 0
  /** cameraSubjects 캐시. step()이 시작될 때 비운다. */
  private subjectsCache: Record<string, string[]> | null = null
  private currentPhase: Phase = 'live'
  /** 시작한 코너 수. 코너 경계 스텝이 광고 스텝이면 재개 뒤 첫 스텝에 시작한다(Ruling 36). */
  private cornersStarted = 0
  private onAirCameraId: string
  /** 직전 스텝에 생겨 이번 스텝에 판정할 이벤트 */
  private pendingEvents: PhenomenonEvent[] = []
  /** 이번 스텝에 생긴 이벤트. 광고로 멈춘 스텝은 재개 뒤에도 이어서 쌓는다. */
  private currentEvents: PhenomenonEvent[] = []
  /** 출연자마다 마지막으로 연루된 사고(지시 이어받기, spec Plan B1 3.2). 광고가 지운다. */
  private readonly involvement: InvolvementMap = new Map()
  /** 방송이 조용한 스텝 수(정적 줄·시청률). 송출된 사고나 소리 나는 기척이 끊는다. */
  private silentSteps = 0
  /**
   * 눈에 띄는 일이 없는 스텝 수(출연자의 지루함). 송출된 사고만 끊는다.
   * 버릇의 헛기침·킥킥거림은 방송의 정적은 메우지만 출연자를 덜 지루하게 하지는 않는다.
   */
  private lullSteps = 0
  /** 정적 단계별 임계 스텝(강도 오름차순). 쇼 배율에 따라 생성자에서 한 번 계산한다. */
  private readonly silenceThresholds: readonly { intensity: Intensity; steps: number }[]
  /** 관객석이 송출 화면에 연속으로 잡힌 스텝 수 */
  private audienceOnAirSteps = 0
  private readonly lines: LogLine[] = []
  /**
   * 마지막으로 줄이 새로 생긴 스텝. 묶여 repeat만 오른 것은 치지 않는다. 재촉(L2)의 공백 기준이며
   * living spec 5.2-4의 "묶인 줄은 1줄"과 livingMetrics의 공백 측정에 맞춘다(Ruling 14, Ruling 8 대체).
   */
  private lastNewLineStep = 0
  private deepestEvent: PhenomenonEvent | null = null
  private autoSlowmo: AutoSlowmo | null = null
  private readonly slowmoGauges = new Set<GaugeKind>()
  private readonly inputs: InputRecord[] = []
  /** 스텝 n 직후의 시청자 수(index n). 1초 전 추세 비교용 */
  private readonly viewersByStep: number[] = [VIEWERS_START]

  private constructor(setup: BroadcastSetup, physics: PhysicsWorld) {
    this.setup = setup
    this.physics = physics
    this.silenceThresholds = INTENSITIES.map((intensity) => ({
      intensity,
      steps: showSecondsToSteps(SILENCE_SHOW_SECONDS[intensity], setup.show),
    }))
    this.rng = createRng(setup.seed)
    this.score = new BroadcastScore(setup.show)
    this.director = new Director([...setup.performers, ...setup.bench], setup.staff)
    this.life = new StudioLife(setup.show, setup.seed)
    this.cast = new Cast(physics)
    this.benchQueue = [...setup.bench]
    this.locator = new StageLocator({
      cast: this.cast,
      physics,
      cameras: this.cameras,
      audienceZone: setup.show.audienceZone,
      onAirCamera: () => this.onAirCamera(),
      onAirFramePoint: () => this.onAirFramePoint(),
    })
    this.lifeActions = new LifeActions({
      cast: this.cast,
      locator: this.locator,
      log: this.log,
      life: this.life,
      names: this.names,
      currentStep: () => this.stepCount,
      emit: (partial) => this.emit(partial),
      addLine: (line) => this.addLine(line),
      move: (member, emitter, move, cause) => this.move(member, emitter, move, cause),
      setMotionCause: (member, cause) => this.setMotionCause(member, cause),
      executeAction: (member, action, cause, options) =>
        this.executeAction(member, action, cause, options),
    })

    const [firstCamera] = setup.show.cameras
    if (firstCamera === undefined) throw new Error('카메라가 없는 쇼입니다.')
    this.onAirCameraId = firstCamera.id
    for (const camera of setup.show.cameras) {
      this.cameras.set(camera.id, camera)
      this.names[camera.id] = camera.label
    }
    this.rig = new CameraRig(setup.show.cameras, setup.staff)
    for (const member of setup.staff) {
      this.staff.set(member.id, member)
      this.names[member.id] = member.shortName
    }
    for (const piece of setup.equipment) {
      this.equipment.set(piece.id, piece)
      this.names[piece.id] = piece.name
      physics.addEquipment(piece)
    }
    for (const performer of [...setup.performers, ...setup.bench]) {
      this.names[performer.id] = performer.shortName
    }
    setup.performers.forEach((performer, index) => {
      this.addToStage(performer, setup.show.homeSpots[index])
    })
    // 클로즈업이 시작 대상을 보게 한 뒤 처음부터 화면에 있던 출연자를 다시 센다.
    const starters = this.cast.active().map((member) => member.def)
    this.rig.startTracking(starters, setup.show.corners[0].startTag)
    this.updateCameraRig()
    for (const member of this.cast.active()) {
      member.wasOnAir = this.isOnAir(this.cast.position(member))
    }
  }

  /** 콘텐츠를 검증하고(spec 9.6) 물리 월드를 만든다. */
  static async create(setup: BroadcastSetup): Promise<Broadcast> {
    const errors = validateShow(
      setup.show,
      [...setup.performers, ...setup.bench],
      setup.staff,
      setup.equipment,
    )
    if (errors.length > 0) throw new ShowValidationError(errors)
    if (setup.performers.length > setup.show.homeSpots.length) {
      throw new Error(
        `home spot(${setup.show.homeSpots.length})보다 출연자(${setup.performers.length})가 많습니다.`,
      )
    }

    await initPhysics()
    const physics = new PhysicsWorld()
    try {
      return new Broadcast(setup, physics)
    } catch (error) {
      physics.dispose()
      throw error
    }
  }

  get phase(): Phase {
    return this.currentPhase
  }

  /** 지금까지 끝낸 스텝 수 = 다음에 돌 스텝 번호 */
  get currentStep(): number {
    return this.stepCount
  }

  /**
   * 한 스텝. live가 아니면 아무것도 하지 않는다.
   * Ruling 36: 광고 입력이 들어온 스텝은 입력(광고 효과)만 적용하고 물리·현상은 진행하지 않지만
   * 스텝 수는 1 올린다. 그래서 step 번호와 입력 묶음이 일대일로 대응하고(replay), 광고 한 번은
   * 방송 시간 한 스텝(1/60초)을 쓴다. 방송 길이(BROADCAST_STEPS)와 코너 경계도 이 번호로 센다.
   */
  step(inputs: readonly BroadcastInput[] = []): void {
    if (this.currentPhase !== 'live') return
    this.subjectsCache = null

    // 1. 입력(전부 검증한 뒤 적용한다)
    validateInputs(inputs, {
      cast: this.cast,
      staff: this.staff,
      director: this.director,
      cameras: this.cameras,
      benchLeft: this.benchQueue.length,
    })
    for (const input of inputs) {
      const recorded = cloneInput(input)
      this.applyInput(recorded)
      this.inputs.push({ step: this.stepCount, input: recorded })
    }
    // 광고 입력이 phase를 바꿨을 수 있다(필드는 위 검사로 'live'로 좁혀져 있어 getter로 읽는다).
    if (this.phase === 'adBreak') {
      this.finishAdStep()
      return
    }
    this.advanceWalkouts()
    this.advanceWalks()
    // 2. 코너 시작
    this.startCornerIfDue()
    // 3. 물리와 충격, 장비 파손
    this.stepPhysics()
    // 4. 직전 스텝 이벤트에 대한 반응(한 스텝에 한 단계)
    this.resolvePendingReactions()
    this.fadePoses()
    // 4-1. 생활: 인지, 감정 틱(단계 줄, 터짐, 응답, 버릇)
    this.runLife()
    // 5. 카메라 방향(추적, 놀람 복구), 시선과 관객 흥분
    this.updateCameraRig()
    this.updateGaze()
    this.updateAudienceNoise()
    // 6. 송출 판정과 점수
    const aired = this.scoreAiredEvents()
    // 7. 정적
    this.updateSilence(aired)
    // 8. 초 단위 집계
    if ((this.stepCount + 1) % STEPS_PER_SECOND === 0) this.score.tickSecond(this.silenceLevel())

    this.stepCount += 1
    this.viewersByStep.push(this.score.viewers)
    // 9. 방송 중단과 종료
    if (this.score.checkHalt() !== null || this.stepCount >= BROADCAST_STEPS) {
      this.currentPhase = 'ended'
    }
    // 10. 자동 슬로모션
    this.updateAutoSlowmo(aired)

    this.pendingEvents = this.currentEvents
    this.currentEvents = []
  }

  /**
   * 광고를 끝내고 방송으로 돌아온다. 복귀할 때 시청자 일부가 이탈한다(spec 5.5).
   * 마지막 스텝에 광고를 받았으면 그대로 방송이 끝난다.
   */
  resumeFromAd(): void {
    if (this.currentPhase !== 'adBreak') {
      throw new Error(`광고 중이 아닙니다: ${this.currentPhase}`)
    }
    this.score.applyAdLoss()
    this.currentPhase = this.stepCount >= BROADCAST_STEPS ? 'ended' : 'live'
  }

  view(): BroadcastView {
    const rating = this.setup.show.rating
    return {
      step: this.stepCount,
      phase: this.currentPhase,
      cornerIndex: this.cornerIndex(),
      onAirCameraId: this.onAirCameraId,
      cameraAngles: this.rig.angles(),
      cameraTargets: this.rig.targets(),
      cameraAimModes: this.rig.aimModes(),
      cameraSubjects: structuredClone(this.cameraSubjects()),
      staff: this.rig.staffViews().map((view) => this.staffView(view)),
      actors: this.cast.all().map((member) => this.actorView(member)),
      equipment: [...this.equipment.keys()].map((id) => this.equipmentView(id)),
      viewers: this.score.viewers,
      viewersTrend: this.viewersTrend(),
      recentPhenomena: this.recentPhenomena(),
      darkZones: this.darkZones.map((zone) => ({ ...zone })),
      gauges: { ...this.score.gauges },
      limits: { ...RATING_LIMITS[rating] },
      haltedBy: this.score.haltedBy,
      log: this.lines.slice(-VIEW_LOG_LINES).map((line) => ({ ...line })),
      autoSlowmo: this.autoSlowmo === null ? null : { ...this.autoSlowmo },
      adsLeft: this.director.adsLeft,
      benchLeft: this.benchQueue.length,
      fatigue: this.director.fatigue,
    }
  }

  /**
   * Ruling 35: 실시간 루프가 쌓아 둔 입력 중 이미 이탈했거나 같은 묶음의 앞선 지시로 이탈할
   * 출연자를 가리키는 direct·track을 뺀다. step의 검증과 같은 기준이라 남은 묶음은 그 이유로
   * throw하지 않는다. 상태는 바꾸지 않는다.
   */
  dropInvalidQueuedInputs(inputs: readonly BroadcastInput[]): BroadcastInput[] {
    return dropGoneActorInputs(inputs, { cast: this.cast, director: this.director })
  }

  inputLog(): InputRecord[] {
    return this.inputs.map(({ step, input }) => ({ step, input: cloneInput(input) }))
  }

  /** 지금까지 생긴 모든 현상 이벤트(복사본) */
  events(): PhenomenonEvent[] {
    return this.log.since(0).map((event) => ({ ...event }))
  }

  /** 가장 깊은 연쇄의 문장들(뿌리부터). 광고로 끊긴 앞부분은 포함하지 않는다. */
  longestChain(): ChainLine[] {
    if (this.deepestEvent === null) return []
    return this.log
      .chain(this.deepestEvent.id)
      .filter(isStrong)
      .slice(-this.deepestEvent.depth)
      .map((event) => ({ step: event.step, text: this.describe(event), depth: event.depth }))
  }

  summary(): BroadcastSummary {
    return {
      peakViewers: this.score.peakViewers,
      averageViewers: this.score.averageViewers(),
      // 기척(강도 0)은 사건 수에 넣지 않는다.
      eventCount: this.log.since(0).filter(isStrong).length,
      maxChainDepth: this.deepestEvent?.depth ?? 0,
      rootLine: this.rootLine(),
    }
  }

  /** 지금까지의 감정 터짐 기록(복사본) */
  burstRecords(): BurstRecord[] {
    return this.life.burstRecords()
  }

  /** 방송 시작부터의 모든 로그 줄(복사본). view().log는 최근 줄만 담는다. */
  logLines(): LogLine[] {
    return this.lines.map((line) => ({ ...line }))
  }

  /** 가장 깊은 연쇄의 뿌리 사건이 남긴 로그 줄. 줄이 없으면(묵음 emit) 그 사건의 문구다. */
  private rootLine(): BroadcastSummary['rootLine'] {
    if (this.deepestEvent === null) return null
    const root = this.log.rootOf(this.deepestEvent.id)
    if (root === undefined) return null
    const line = this.lines.find((candidate) => candidate.eventId === root.id)
    if (line !== undefined) return { step: line.step, text: line.text }
    return { step: root.step, text: describeRootEvent(root, this.names) }
  }

  /** 물리 월드(wasm 메모리)를 해제한다. 두 번 불러도 안전하다. 이후 step과 view는 오류를 던진다. */
  dispose(): void {
    this.subjectsCache = null
    this.physics.dispose()
  }

  // ── 입력 ──────────────────────────────────────────────

  private applyInput(input: BroadcastInput): void {
    switch (input.type) {
      case 'switch':
        this.requireCamera(input.cameraId)
        this.onAirCameraId = input.cameraId
        return
      case 'direct':
        this.directPerformer(input.actorId, input.directiveId)
        return
      case 'directStaff':
        this.directStaff(input.staffId, input.directiveId)
        return
      case 'ad':
        this.takeAd(input.effects)
        return
      case 'track':
        this.rig.setTarget(input.cameraId, input.actorId)
        return
    }
  }

  private directPerformer(actorId: string, directiveId: string): void {
    const member = this.cast.get(actorId)
    if (member === undefined) throw new Error(`무대에 없는 출연자입니다: ${actorId}`)
    const [outcome, rng] = this.director.directPerformer(actorId, directiveId, this.rng)
    this.rng = rng
    if (outcome.kind === 'walkout') {
      this.walkOut(member)
      return
    }
    this.life.addDirective(actorId, outcome.moodShifts, outcome.label, this.stepCount)
    const cause = this.takeoverCause(member)
    const linePrefix = cause === null ? undefined : this.takeoverPrefix(member, cause)
    this.executeAction(member, outcome.action, cause, { linePrefix })
  }

  /** "<출처>의 <사고>에 이어 ". 자기 사고를 이으면 뒤 문장의 주어와 겹치므로 이름을 뺀다. */
  private takeoverPrefix(member: CastMember, cause: PhenomenonEvent): string {
    const noun = eventNoun(cause)
    if (cause.sourceId === member.def.id) return `${noun}에 이어 `
    return `${entityName(cause.sourceId, this.names)}의 ${noun}에 이어 `
  }

  /** 출연자 지시가 이어받을 사고: 창 안의 마지막 연루 사고. 이탈했으면 없다. */
  private takeoverCause(member: CastMember): PhenomenonEvent | null {
    return this.takeoverEntry(member)?.event ?? null
  }

  /**
   * 원인·접두·view 표시가 함께 쓰는 판단. 광고에 끊긴 사고는 기억에 남아 있어도 잇지 않는다
   * (reset 없는 광고는 광고 직전 사고를 재개 첫 스텝에 다시 인지시킨다).
   */
  private takeoverEntry(member: CastMember): Involvement | null {
    if (member.walkedOut) return null
    const entry = activeInvolvement(
      this.involvement.get(member.def.id),
      this.stepCount,
      TAKEOVER_WINDOW_STEPS,
    )
    if (entry === null || this.log.linkedCauseDepth(entry.event.id) === 0) return null
    return entry
  }

  private takeoverView(member: CastMember): TakeoverView | null {
    const entry = this.takeoverEntry(member)
    if (entry === null) return null
    const remainingSteps = remainingTakeoverSteps(entry, this.stepCount, TAKEOVER_WINDOW_STEPS)
    return {
      eventId: entry.event.id,
      text: this.describe(entry.event),
      remainingBodySeconds: remainingSteps * STEP_SECONDS,
    }
  }

  private directStaff(staffId: string, directiveId: string): void {
    const member = this.requireStaff(staffId)
    const [result, rng] = this.director.directStaff(staffId, directiveId, this.rng)
    this.rng = rng
    // 엇나간 지시는 놀람과 같다(무작위 방향, 놀람 로그, 유지 뒤 자동 복구, R8).
    if (result.aim === 'random') {
      this.panicCamera(member, null)
      return
    }
    this.rig.direct(staffId, this.directedAim(member.cameraId, result.aim))
  }

  /** 관객석과 가장 가까운 출연자는 지시 순간의 방향으로 고정한다. 출연자가 없으면 기준으로 돌린다. */
  private directedAim(cameraId: string, aim: StaffDirectiveDef['aim']): DirectedAim {
    const { position } = this.requireCamera(cameraId)
    switch (aim) {
      case 'default':
        return { kind: 'default' }
      case 'audience':
        return { kind: 'yaw', yaw: yawBetween(position, this.locator.audiencePosition()) }
      case 'nearestPerformer': {
        const nearest = this.cast.nearestActive(position, null)
        if (nearest === undefined) return { kind: 'default' }
        return { kind: 'yaw', yaw: yawBetween(position, this.cast.position(nearest)) }
      }
    }
  }

  /** Ruling 4: 광고는 입력 하나로 효과와 대가를 적용하고 adBreak로 들어간다(검증은 validateInputs). */
  private takeAd(effects: readonly AdEffect[]): void {
    if (!this.director.takeAd()) throw new Error('남은 광고가 없습니다.')

    for (const effect of effects) {
      switch (effect) {
        case 'relief':
          this.score.relieveGauges(AD_GAUGE_RELIEF)
          break
        case 'reset':
          this.resetCast()
          break
        case 'setup':
          this.bringInBench()
          break
      }
    }
    this.log.breakChains()
    this.involvement.clear()
    this.silentSteps = 0
    this.lullSteps = 0
    this.currentPhase = 'adBreak'
  }

  /**
   * Ruling 36: 광고 스텝은 물리·현상 없이 스텝 수만 올린다. 초 경계면 시청자 표본도 남겨
   * 평균 시청자의 표본 수가 방송 초 수와 맞게 한다(광고가 정적을 지웠으므로 정적은 0이다).
   */
  private finishAdStep(): void {
    if ((this.stepCount + 1) % STEPS_PER_SECOND === 0) this.score.tickSecond(this.silenceLevel())
    this.stepCount += 1
    this.viewersByStep.push(this.score.viewers)
  }

  private resetCast(): void {
    const members = this.cast.active()
    // 아직 옛 자리에 있는 다른 출연자와 겹치면 옆으로 비켜 서므로, 모두 옮긴 뒤 한 번 더 세운다.
    for (let pass = 0; pass < 2; pass++) {
      for (const member of members) this.physics.teleport(member.def.id, member.home)
    }
    for (const member of members) {
      member.pose = 'idle'
      member.walkGoal = null
      this.setMotionCause(member, null)
    }
    this.cooldowns.clear()
    this.director.resetFatigue()
    // 스태프도 놀람을 끝내고 자리로 돌아온다(R12). 광고가 끝내므로 복구 완료 로그는 없다.
    this.rig.calmAllStaff()
    // 관객의 흥분도 가라앉아 관객석 연속 송출 시간을 처음부터 다시 센다.
    this.audienceOnAirSteps = 0
    // Ruling 22: 감정을 초기화하므로 광고 전 사고에 대한 반응도 남기지 않는다.
    this.pendingEvents = []
    this.life.resetAll(this.stepCount)
  }

  /** 대기 출연자를 빈 home spot(없으면 bench 자리)에 올린다. */
  private bringInBench(): void {
    const performer = this.benchQueue.shift()
    if (performer === undefined) throw new Error('투입할 대기 출연자가 없습니다.')
    const taken = this.cast.active().map((member) => member.home)
    const spot = this.setup.show.homeSpots.find(
      (candidate) => !taken.some((home) => home.x === candidate.x && home.z === candidate.z),
    )
    this.addToStage(performer, spot ?? this.setup.show.benchSpot)
  }

  private addToStage(performer: PerformerDef, home: FloorPoint): void {
    const member = this.cast.add(performer, home)
    // 처음부터 화면에 있던 출연자는 '새로 잡힘'으로 치지 않는다.
    member.wasOnAir = this.isOnAir(this.cast.position(member))
    this.life.join(performer, this.stepCount)
  }

  // ── 이탈 ──────────────────────────────────────────────

  private walkOut(member: CastMember): void {
    member.walkedOut = true
    member.walkoutStep = this.stepCount
    member.pose = 'angry'
    this.setMotionCause(member, null)
    this.life.leave(member.def.id)
    const position = this.cast.position(member)
    this.addLine({
      text: `${withSubject(member.def.shortName)} 방송을 박차고 나간다!`,
      kind: 'incident',
      depth: 1,
      eventId: null,
      position,
    })
    for (const kind of ['anger', 'noise'] as const) {
      this.emit({
        kind,
        intensity: WALKOUT_INTENSITY,
        sourceId: member.def.id,
        targetId: null,
        ...position,
        causeId: null,
      })
    }
    this.walkTowardExit(member)
  }

  /** 이탈자는 출구로 걸어가다가 WALKOUT_SECONDS 뒤 물리 월드에서 빠진다. */
  private advanceWalkouts(): void {
    for (const member of this.cast.present()) {
      if (member.walkoutStep === null) continue
      if (this.stepCount - member.walkoutStep >= WALKOUT_STEPS) {
        this.cast.depart(member)
      } else {
        this.walkTowardExit(member)
      }
    }
  }

  /** 출구 쪽 바닥 방향으로 걷는다. 출구와 같은 자리면 수평으로는 멈춘다. */
  private walkTowardExit(member: CastMember): void {
    const state = this.physics.actorState(member.def.id)
    if (state === undefined || state.tumbling) return
    const direction = floorDirection(state.position, this.setup.show.exit) ?? { x: 0, z: 0 }
    // 위로 속도를 주면 넘어지므로 수직 속도는 떨어지는 쪽만 유지한다.
    this.physics.impulse(member.def.id, {
      x: direction.x * WALKOUT_SPEED,
      y: Math.min(state.velocity.y, 0),
      z: direction.z * WALKOUT_SPEED,
    })
  }

  /** walk 목표로 걷는다. 도착, 넘어짐, 시간 초과면 수평으로 멈추고 목표를 지운다. */
  private advanceWalks(): void {
    for (const member of this.cast.active()) {
      const goal = member.walkGoal
      if (goal === null) continue
      const state = this.physics.actorState(member.def.id)
      if (state === undefined || state.tumbling) {
        member.walkGoal = null
        continue
      }
      const arrived = floorDistance(state.position, goal.to) <= WALK_ARRIVE_RADIUS
      const direction = floorDirection(state.position, goal.to)
      const done = arrived || direction === null || this.stepCount >= goal.untilStep
      if (done) member.walkGoal = null
      const speed = done ? 0 : goal.speed
      // 위로 속도를 주면 넘어지므로 수직 속도는 떨어지는 쪽만 유지한다.
      this.physics.impulse(member.def.id, {
        x: (direction?.x ?? 0) * speed,
        y: Math.min(state.velocity.y, 0),
        z: (direction?.z ?? 0) * speed,
      })
    }
  }

  /** 새 행동 없이 POSE_HOLD_SECONDS가 지난 감정 포즈는 idle로 돌아온다. */
  private fadePoses(): void {
    for (const member of this.cast.active()) {
      if (!FADING_POSES.has(member.pose)) continue
      if (this.stepCount - member.poseStep >= POSE_HOLD_STEPS) member.pose = 'idle'
    }
  }

  /** 송출 카메라가 지금 보는 방향으로 사거리 × ON_AIR_FRAME_DEPTH_RATIO 떨어진 바닥점(스튜디오 안). */
  private onAirFramePoint(): Vec3 {
    const camera = this.onAirCamera()
    const radians = (this.rig.angle(camera.id) * Math.PI) / 180
    const depth = camera.range * ON_AIR_FRAME_DEPTH_RATIO
    const clamp = (value: number, max: number) =>
      Math.min(max - FLOOR_MARGIN, Math.max(FLOOR_MARGIN, value))
    return {
      x: clamp(camera.position.x + Math.cos(radians) * depth, STUDIO_WIDTH),
      y: STANDING_Y,
      z: clamp(camera.position.z + Math.sin(radians) * depth, STUDIO_DEPTH),
    }
  }

  // ── 코너, 물리, 반응, 시선 ─────────────────────────────

  private startCornerIfDue(): void {
    if (this.stepCount < this.cornersStarted * CORNER_STEPS) return
    const corner = this.setup.show.corners[this.cornersStarted]
    if (corner === undefined) return
    this.cornersStarted += 1
    for (const member of this.cast.active()) {
      if (!member.def.tags.includes(corner.startTag)) continue
      const reaction = member.def.reactions.find(
        ({ trigger }) => trigger.kind === 'corner' && trigger.tag === corner.startTag,
      )
      if (reaction === undefined || !this.rollChance(reaction.chance)) continue
      this.executeAction(member, reaction.action, null)
    }
  }

  private stepPhysics(): void {
    for (const contact of this.physics.step()) {
      const impact = this.emitImpact(contact)
      for (const id of [contact.a, contact.b]) {
        const piece = this.equipment.get(id)
        if (piece === undefined || this.brokenEquipment.has(id)) continue
        if (contact.intensity >= piece.breakAt) this.breakEquipment(piece, impact)
      }
    }
  }

  /** source는 더 빨랐던 쪽(Ruling 9), 원인은 그 쪽을 움직이게 한 이벤트다. */
  private emitImpact(contact: Contact): PhenomenonEvent {
    const sourceId = contact.fasterId
    const targetId = contact.b === 'floor' ? null : sourceId === contact.a ? contact.b : contact.a
    const position = this.locator.entityPosition(sourceId)
    if (position === undefined) throw new Error(`접촉한 물리 몸을 찾을 수 없습니다: ${sourceId}`)
    const cause = this.motionCauseOf(sourceId)
    const impact = this.emit({
      kind: 'impact',
      intensity: contact.intensity,
      sourceId,
      targetId,
      ...position,
      causeId: cause?.id ?? null,
    })
    // 맞은 출연자는 이제 이 충격 때문에 움직인다(날아간 출연자가 다음 충돌의 원인을 잇는다).
    const hit = targetId === null ? undefined : this.cast.get(targetId)
    if (hit !== undefined) this.setMotionCause(hit, impact)
    return impact
  }

  private breakEquipment(piece: EquipmentDef, impact: PhenomenonEvent): void {
    this.physics.releaseEquipment(piece.id)
    this.brokenEquipment.set(piece.id, impact)
    const position = this.locator.entityPosition(piece.id) ?? piece.position
    this.emitAll({ id: piece.id, position }, piece.onBreak, impact)
    if (piece.kind !== 'hangingLight' || piece.darknessZone === undefined) return

    const zone = piece.darknessZone
    this.darkZones.push(zone)
    this.emit({
      kind: 'darkness',
      intensity: LIGHT_DARKNESS_INTENSITY,
      sourceId: piece.id,
      targetId: null,
      x: zone.x,
      y: STANDING_Y,
      z: zone.z,
      causeId: impact.id,
    })
  }

  private resolvePendingReactions(): void {
    if (this.pendingEvents.length === 0) return
    const reactors: ReactorView[] = [
      ...this.cast.active().map((member) => {
        const position = this.cast.position(member)
        return {
          id: member.def.id,
          ...position,
          inDarkness: this.inDarkness(position),
          reactions: member.def.reactions,
          walkedOut: false,
        }
      }),
      ...[...this.staff.values()].map((member) => ({
        id: member.id,
        ...this.requireCamera(member.cameraId).position,
        inDarkness: false,
        reactions: member.reactions,
        walkedOut: false,
      })),
      this.audienceReactor(),
    ]
    const [planned, rng] = resolveReactions(
      this.pendingEvents,
      reactors,
      this.cooldowns,
      this.stepCount,
      this.rng,
      (event) => this.describe(event),
    )
    this.rng = rng

    for (const plan of planned) {
      const member = this.cast.get(plan.actorId)
      if (member !== undefined) {
        this.executeAction(member, plan.action, plan.cause)
        continue
      }
      const staffMember = this.staff.get(plan.actorId)
      if (staffMember !== undefined) {
        this.panicCamera(staffMember, plan.cause)
        continue
      }
      if (plan.actorId === AUDIENCE_ID) {
        const emitter: Emitter = { id: AUDIENCE_ID, position: this.locator.audiencePosition() }
        this.emitAll(emitter, plan.action.emits, plan.cause)
      }
    }
  }

  /** 관객도 다른 요소처럼 반응 판정과 쿨다운(현상 종류 단위)을 거친다. */
  private audienceReactor(): ReactorView {
    const position = this.locator.audiencePosition()
    return {
      id: AUDIENCE_ID,
      ...position,
      inDarkness: this.inDarkness(position),
      reactions: AUDIENCE_REACTIONS,
      walkedOut: false,
    }
  }

  /** 송출 화면이 관객 구역 중앙을 잡고 있는 동안 AUDIENCE_NOISE_SECONDS마다 관객이 소음을 낸다. */
  private updateAudienceNoise(): void {
    const position = this.locator.audiencePosition()
    if (!this.isOnAir(position)) {
      this.audienceOnAirSteps = 0
      return
    }
    this.audienceOnAirSteps += 1
    if (this.audienceOnAirSteps % AUDIENCE_NOISE_STEPS !== 0) return
    this.emit({
      kind: 'noise',
      intensity: AUDIENCE_NOISE_INTENSITY,
      sourceId: AUDIENCE_ID,
      targetId: null,
      ...position,
      causeId: null,
    })
  }

  /** 스태프 반응은 행동 대신 담당 카메라를 무작위 방향으로 돌린다(겁쟁이 카메라 감독, spec 5.6). */
  private panicCamera(member: StaffDef, cause: PhenomenonEvent | null): void {
    const camera = this.requireCamera(member.cameraId)
    this.rig.panic(member.id, this.randomAngle())
    this.addLine({
      text: `${withSubject(member.shortName)} 놀라 카메라를 휘둘렀다`,
      kind: 'staff',
      // 광고로 끊긴 원인은 잇지 않는다(Ruling 9)
      depth: this.log.linkedCauseDepth(cause?.id ?? null) + 1,
      eventId: null,
      position: camera.position,
    })
  }

  /**
   * 이탈한 추적 대상을 다시 고르고 리그를 한 스텝 진행한다. 복구를 마친 스태프는 로그를 남긴다.
   * 반응 단계 뒤에 부르므로, 이번 스텝의 반응(또는 입력)으로 생긴 놀람도 같은 스텝의 이 update에서
   * 경과 1이 된다. 즉 놀란 스텝이 유지 시간의 첫 스텝이다(리그 단위 테스트의 panic 직후 update 1회와 같다).
   */
  private updateCameraRig(): void {
    this.rig.retarget(this.cast.active().map((member) => member.def))
    this.rig.update((actorId) => {
      const member = this.cast.get(actorId)
      return member === undefined ? null : this.cast.position(member)
    })
    for (const staffId of this.rig.settledStaffIds()) {
      const member = this.requireStaff(staffId)
      this.addLine({
        text: `${withSubject(member.shortName)} 자리를 잡았다`,
        kind: 'staff',
        depth: 1,
        eventId: null,
        position: this.requireCamera(member.cameraId).position,
      })
    }
  }

  private updateGaze(): void {
    const camera = this.onAirCamera()
    for (const { member, reactions } of updateGaze(this.cast, (point) => this.isOnAir(point))) {
      for (const reaction of reactions) {
        if (this.fireGazeReaction(member, reaction, camera)) break
      }
    }
  }

  /** Ruling 23: 시선 반응은 원인 없이(깊이 1) 시작한다. 실행했으면 true. */
  private fireGazeReaction(member: CastMember, reaction: ReactionDef, camera: CameraDef): boolean {
    const { trigger } = reaction
    if (trigger.kind !== 'gaze') return false
    const key = cooldownKey(trigger)
    if (!this.cooldowns.ready(member.def.id, key, this.stepCount)) return false
    if (!this.rollChance(reaction.chance)) return false
    this.cooldowns.mark(member.def.id, key, this.stepCount)

    const name = member.def.shortName
    const text =
      trigger.when === 'enter'
        ? `${withSubject(camera.label)} ${withObject(name)} 잡았다`
        : `${withSubject(name)} 한동안 화면에 잡히지 않았다`
    const position = this.cast.position(member)
    this.addLine({ text, kind: 'incident', depth: 1, eventId: null, position })
    this.executeAction(member, reaction.action, null)
    return true
  }

  // ── 생활(감정·버릇) ────────────────────────────────────

  /**
   * 활동 출연자가 직전 스텝 사건을 인지하고, 감정 틱이면 StudioLife의 출력을 순서대로 실행한다.
   * 판정은 StudioLife, 문장은 narration이 맡고 여기서는 연결과 실행만 한다.
   */
  private runLife(): void {
    const members = this.cast.active()
    const perceivers = members.map((member) => this.perceiverOf(member))
    this.life.perceive(this.pendingEvents, perceivers, this.stepCount)
    updateInvolvement(this.involvement, this.pendingEvents, perceivers)
    if (!this.life.isTickStep(this.stepCount)) return
    const outputs = this.life.tick({
      step: this.stepCount,
      // 감정의 'silence' 상황은 방송 정적이 아니라 밋밋함(눈에 띄는 일 없음)이다
      silence: this.lullSteps >= this.silenceThresholds[0].steps,
      members: this.lifeMembers(members),
      lastLineStep: this.lastNewLineStep,
    })
    for (const output of outputs) this.lifeActions.execute(output)
  }

  private perceiverOf(member: CastMember): Perceiver {
    const position = this.cast.position(member)
    return { id: member.def.id, ...position, inDarkness: this.inDarkness(position) }
  }

  /** mind가 있는 활동 출연자의 틱 상태. 근처 태그는 mind와 관계없이 다른 활동 출연자 모두에서 찾는다. */
  private lifeMembers(active: readonly CastMember[]): LifeMember[] {
    const placed = active.map((member) => ({ member, position: this.cast.position(member) }))
    return placed
      .filter(({ member }) => this.life.has(member.def.id))
      .map(({ member, position }) => ({
        id: member.def.id,
        ...position,
        onAir: this.isOnAir(position),
        resting: this.isResting(member),
        nearTags: placed
          .filter(
            (other) =>
              other.member !== member && floorDistance(other.position, position) <= NEAR_RADIUS,
          )
          .flatMap((other) => other.member.def.tags),
      }))
  }

  /** 넘어짐·날아감·walk 이동 중이거나 마지막 행동 뒤 잠깐이면 버릇과 터짐을 미룬다(L5). */
  private isResting(member: CastMember): boolean {
    return (
      this.cast.placement(member).tumbling ||
      member.walkGoal !== null ||
      this.stepCount - member.poseStep < HABIT_REST_STEPS
    )
  }

  // ── 송출, 정적, 슬로모션 ───────────────────────────────

  private scoreAiredEvents(): StrongEvent[] {
    // 기척(강도 0)은 점수·정적·슬로모션에 들어가지 않으므로 송출 집계에서 뺀다.
    const aired = this.currentEvents.filter(
      (event): event is StrongEvent => isStrong(event) && this.isAired(event),
    )
    for (const event of aired) {
      this.score.scoreEvent(event, this.presenceOf(event.sourceId), this.hitMultiplierOf(event))
    }

    for (const member of this.cast.present()) {
      const rates = member.def.onAirGaugePerSecond
      if (rates === undefined || !this.isOnAir(this.cast.position(member))) continue
      for (const kind of GAUGE_KINDS) {
        const rate = rates[kind]
        if (rate !== undefined) this.score.addGauge(kind, rate / STEPS_PER_SECOND)
      }
    }
    return aired
  }

  /** 이벤트 위치나 source·target 출연자가 송출 화면 안이면 송출된 것이다. */
  private isAired(event: PhenomenonEvent): boolean {
    if (this.isOnAir(event)) return true
    return [event.sourceId, event.targetId].some((id) => {
      const member = id === null ? undefined : this.cast.get(id)
      if (member === undefined || member.departedAt !== null) return false
      return this.isOnAir(this.cast.position(member))
    })
  }

  /** Ruling 3: 출연자가 아닌 source의 존재감은 1이다. */
  private presenceOf(sourceId: string): 1 | 2 | 3 {
    return this.cast.get(sourceId)?.def.presence ?? 1
  }

  /** 충격에 얽힌 출연자 중 가장 큰 폭력성 배율(예: 할머니가 얽히면 더 폭력적으로 보인다). */
  private hitMultiplierOf(event: PhenomenonEvent): number {
    if (event.kind !== 'impact') return 1
    const multipliers = [event.sourceId, event.targetId].map((id) =>
      id === null ? 1 : (this.cast.get(id)?.def.hitViolenceMultiplier ?? 1),
    )
    return Math.max(...multipliers)
  }

  /** 송출된 소리 나는 기척(버릇의 헛기침·킥킥거림·흥얼거림 등). 방송에 소리가 났으니 데드에어가 아니다. */
  private soundStirAired(): boolean {
    return this.currentEvents.some(
      (event) => isStir(event) && SILENCE_BREAKING_STIR_KINDS.has(event.kind) && this.isAired(event),
    )
  }

  private updateSilence(aired: StrongEvent[]): void {
    const shown = aired.some(isPhenomenonShown)
    this.lullSteps = shown ? 0 : this.lullSteps + 1
    this.silentSteps = shown || this.soundStirAired() ? 0 : this.silentSteps + 1
    const reached = this.silenceThresholds.find(({ steps }) => this.silentSteps === steps)
    if (reached === undefined) return
    const { intensity } = reached
    this.emit({
      kind: 'silence',
      intensity,
      sourceId: 'broadcast',
      targetId: null,
      x: STUDIO_WIDTH / 2,
      y: STUDIO_HEIGHT / 2,
      z: STUDIO_DEPTH / 2,
      causeId: null,
    })
  }

  private silenceLevel(): 0 | Intensity {
    let level: 0 | Intensity = 0
    for (const { intensity, steps } of this.silenceThresholds) {
      if (this.silentSteps >= steps) level = intensity
    }
    return level
  }

  /** 게이지가 상한의 80%에 처음 이르거나(게이지마다 한 번) 강도 3 현상이 송출되면 건다. */
  private updateAutoSlowmo(aired: StrongEvent[]): void {
    const step = this.stepCount - 1
    const newGauge = this.score.nearLimitGauges().find((gauge) => !this.slowmoGauges.has(gauge))
    if (newGauge !== undefined) {
      this.slowmoGauges.add(newGauge)
      const trigger = aired.findLast(
        (event) => gaugeRiskIncrease(event.kind, event.intensity)[newGauge] !== undefined,
      )
      this.autoSlowmo = { gauge: newGauge, eventId: trigger?.id ?? null, step }
      return
    }
    // gaze는 카메라가 잡았다는 표시일 뿐 사고가 아니고, silence는 아무 일도 없다는 뜻이라
    // 강도 3이어도 PD가 개입할 순간이 아니다. 화면에 보이는 사고만 슬로모션을 건다.
    const strong = aired.find(
      (event) => isPhenomenonShown(event) && event.intensity === MAX_INTENSITY,
    )
    if (strong !== undefined) this.autoSlowmo = { gauge: null, eventId: strong.id, step }
  }

  // ── 행동 실행 ─────────────────────────────────────────

  /**
   * 행동을 실행하고 내뿜은 현상과 이동 대상을 돌려준다.
   * silent면 행동 줄과 현상 줄을 남기지 않는다(점수·연쇄는 그대로).
   * linePrefix는 행동 줄이 있으면 그 줄, 없으면 첫 현상 줄 앞에 붙는다.
   */
  private executeAction(
    member: CastMember,
    action: ActionDef,
    cause: PhenomenonEvent | null,
    options: ActionOptions = {},
  ): ActionResult {
    const silent = options.silent ?? false
    let linePrefix = options.linePrefix ?? ''
    member.pose = action.pose
    member.poseStep = this.stepCount
    this.setMotionCause(member, cause)
    const emitter: Emitter = { id: member.def.id, position: this.cast.position(member) }
    if (action.line !== undefined && !silent) {
      this.addLine({
        text: `${linePrefix}${action.line}`,
        kind: 'incident',
        // 광고 전 원인이면 1부터 센다(Ruling 9)
        depth: this.log.linkedCauseDepth(cause?.id ?? null) + 1,
        eventId: null,
        position: emitter.position,
      })
      linePrefix = ''
    }
    const moveTarget =
      action.move === undefined ? NO_TARGET : this.move(member, emitter, action.move, cause)
    return { events: this.emitAll(emitter, action.emits, cause, silent, linePrefix), moveTarget }
  }

  /** 이동하고 이동 대상을 돌려준다(home 이동은 대상 없음). */
  private move(
    member: CastMember,
    emitter: Emitter,
    move: MoveDef,
    cause: PhenomenonEvent | null,
  ): Target {
    const id = member.def.id
    if (move.type === 'home') {
      this.physics.teleport(id, member.home)
      return NO_TARGET
    }
    const resolved = this.locator.resolveTarget(move.toward, emitter, cause)
    // 대상까지의 바닥 방향 단위 벡터. 대상이 없거나 같은 자리면 수평으로 움직이지 않는다.
    const target = resolved.position
    if (move.type === 'walk') {
      member.walkGoal =
        target === null
          ? null
          : {
              to: { x: target.x, z: target.z },
              speed: move.speed,
              untilStep: this.stepCount + WALK_MAX_STEPS,
            }
      return resolved
    }
    const direction = target === null ? null : floorDirection(emitter.position, target)
    const horizontal = (sign: 1 | -1, speed: number): Vec3 => ({
      x: sign * (direction?.x ?? 0) * speed,
      y: 0,
      z: sign * (direction?.z ?? 0) * speed,
    })
    switch (move.type) {
      case 'dash':
        if (direction !== null) this.physics.impulse(id, horizontal(1, move.speed))
        break
      case 'leap':
        this.physics.impulse(id, {
          ...horizontal(1, move.speed),
          y: move.speed * LEAP_VERTICAL_RATIO,
        })
        break
      case 'flee':
        if (direction !== null) this.physics.impulse(id, horizontal(-1, move.speed))
        break
    }
    return resolved
  }

  private emitAll(
    emitter: Emitter,
    emits: readonly EmitDef[],
    cause: PhenomenonEvent | null,
    silent = false,
    linePrefix = '',
  ): PhenomenonEvent[] {
    // 접두는 줄을 남긴 첫 현상에만 붙는다(기척은 줄이 없다)
    let prefix = linePrefix
    return emits.map((emit) => {
      const intensity =
        emit.intensity === 'causePlusOne'
          ? (Math.min(MAX_INTENSITY, (cause?.intensity ?? 0) + 1) as Intensity)
          : emit.intensity
      const event = this.emit(
        {
          kind: emit.kind,
          intensity,
          sourceId: emitter.id,
          targetId: this.locator.resolveTarget(emit.target, emitter, cause).id,
          ...emitter.position,
          causeId: cause?.id ?? null,
        },
        silent,
        prefix,
      )
      if (leavesLine(event, silent)) prefix = ''
      return event
    })
  }

  private setMotionCause(member: CastMember, cause: PhenomenonEvent | null): void {
    member.motionCause = cause
    member.motionCauseStep = this.stepCount
  }

  /**
   * 출연자의 움직임 원인은 받은 뒤 MOTION_CAUSE_SECONDS까지만 잇는다(Ruling 29). 한참 전 반응의
   * 원인이 나중 충돌에 붙어 연쇄 깊이를 부풀리지 않게 한다. 떨어지는 장비는 파손 충격을 계속 잇는다.
   */
  private motionCauseOf(id: string): PhenomenonEvent | null {
    const member = this.cast.get(id)
    if (member !== undefined) {
      const expired = this.stepCount - member.motionCauseStep > MOTION_CAUSE_STEPS
      return expired ? null : member.motionCause
    }
    return this.brokenEquipment.get(id) ?? null
  }

  // ── 공통 ──────────────────────────────────────────────

  /** silent면 줄을 남기지 않는다(버릇·터짐이 자기 줄을 따로 남긴다, L3). */
  private emit(
    partial: Omit<PhenomenonEvent, 'id' | 'depth' | 'step'>,
    silent = false,
    linePrefix = '',
  ): PhenomenonEvent {
    const event = this.log.emit({ ...partial, step: this.stepCount })
    this.currentEvents.push(event)
    // 기척은 로그 줄이 없고 가장 깊은 연쇄 후보도 아니다.
    if (isStir(event)) return event
    if (this.deepestEvent === null || event.depth > this.deepestEvent.depth) {
      this.deepestEvent = event
    }
    if (leavesLine(event, silent)) {
      this.addLine({
        text: `${linePrefix}${this.describe(event)}`,
        kind: event.kind === 'silence' ? 'silence' : 'incident',
        depth: event.depth,
        eventId: event.id,
        position: event,
      })
    }
    return event
  }

  /** 직전 줄과 text·kind·depth·emotion이 모두 같으면 새 줄 대신 직전 줄의 repeat를 올린다(step은 처음 것). */
  private addLine({ text, kind, depth, eventId, position, emotion = null }: LineInput): void {
    const last = this.lines.at(-1)
    const sameAsLast =
      last !== undefined &&
      last.text === text &&
      last.kind === kind &&
      last.depth === depth &&
      last.emotion === emotion
    if (sameAsLast) {
      last.repeat += 1
      if (eventId !== null) last.lastEventId = eventId
      return
    }
    this.lastNewLineStep = this.stepCount
    this.lines.push({
      index: this.lines.length,
      step: this.stepCount,
      text,
      kind,
      emotion,
      repeat: 1,
      depth,
      eventId,
      lastEventId: eventId,
      x: position.x,
      y: position.y,
      z: position.z,
    })
  }

  private describe(event: PhenomenonEvent): string {
    return describeEvent(event, this.names)
  }

  private rollChance(chance: number | undefined): boolean {
    if (chance === undefined) return true
    const [roll, rng] = nextFloat(this.rng)
    this.rng = rng
    return roll < chance
  }

  private randomAngle(): number {
    const [roll, rng] = nextFloat(this.rng)
    this.rng = rng
    return roll * 360
  }

  private requireStaff(staffId: string): StaffDef {
    const member = this.staff.get(staffId)
    if (member === undefined) throw new Error(`알 수 없는 스태프입니다: ${staffId}`)
    return member
  }

  private requireCamera(cameraId: string): CameraDef {
    const camera = this.cameras.get(cameraId)
    if (camera === undefined) throw new Error(`알 수 없는 카메라입니다: ${cameraId}`)
    return camera
  }

  private onAirCamera(): CameraDef {
    return this.requireCamera(this.onAirCameraId)
  }

  /**
   * 송출 카메라의 시야 안이고 장비가 시선을 가리지 않으면 송출된다(spec 3.1).
   * lineOfSight는 직전 물리 step의 장비 위치를 쓰므로 물리 step 뒤에 부른다.
   * 생성 직후(첫 step 전) view와 wasOnAir 초기값은 장비 가림을 반영하지 않는다.
   */
  private isOnAir(point: Vec3): boolean {
    return this.isInSight(this.onAirCamera(), point)
  }

  /**
   * 카메라 시야 안이고 장비가 시선을 가리지 않는지. 송출 판정과 피드 대상이 함께 쓴다.
   * point가 장비 자신이면 ignoreEquipmentId로 자기 collider를 뺀다.
   */
  private isInSight(camera: CameraDef, point: Vec3, ignoreEquipmentId?: string): boolean {
    return (
      inFrame(camera, this.rig.angle(camera.id), point) &&
      this.physics.lineOfSight(camera.position, point, ignoreEquipmentId)
    )
  }

  /**
   * 카메라마다 지금 시야에 잡힌 출연자, 장비 id와 관객석('audience')(이탈한 출연자는 없다).
   * 송출 판정과 같은 기준이며 장비는 다른 장비에 가려도 빠진다. 위치는 step 안에서만 바뀌므로 step마다 한 번 계산한다.
   */
  private cameraSubjects(): Record<string, string[]> {
    if (this.subjectsCache !== null) return this.subjectsCache
    const subjects: Record<string, string[]> = {}
    for (const camera of this.cameras.values()) {
      const actors = this.cast
        .all()
        .filter(
          (member) =>
            member.departedAt === null && this.isInSight(camera, this.cast.position(member)),
        )
        .map((member) => member.def.id)
      const equipment = [...this.equipment.keys()].filter((id) => {
        const state = this.physics.equipmentState(id)
        return state !== undefined && this.isInSight(camera, state.position, id)
      })
      // 관객석은 관객 소음(updateAudienceNoise)의 송출 판정과 같은 점(구역 중앙)으로 본다.
      const audience = this.isInSight(camera, this.locator.audiencePosition()) ? [AUDIENCE_ID] : []
      subjects[camera.id] = [...actors, ...equipment, ...audience]
    }
    this.subjectsCache = subjects
    return subjects
  }

  /** 어둠 구역은 바닥 원이다. 높이와 관계없이 원 안에 서 있거나 떠 있으면 어둠 속이다. */
  private inDarkness(point: Vec3): boolean {
    return this.darkZones.some((zone) => floorDistance(point, zone) <= zone.radius)
  }

  private cornerIndex(): 0 | 1 | 2 {
    const index = Math.floor(this.stepCount / CORNER_STEPS)
    return Math.min(LAST_CORNER_INDEX, index) as 0 | 1 | 2
  }

  private actorView(member: CastMember): ActorView {
    const placement = this.cast.placement(member)
    const pose: Pose = placement.tumbling ? (placement.grounded ? 'fallen' : 'flying') : member.pose
    const used = this.director.directivesUsed(member.def.id)
    const { position, up } = placement
    return {
      id: member.def.id,
      name: member.def.name,
      x: position.x,
      y: position.y,
      z: position.z,
      up: { ...up },
      pose,
      onAir: member.departedAt === null && this.isOnAir(position),
      walkedOut: member.walkedOut,
      departed: member.departedAt !== null,
      directivesLeft: Math.max(0, TOLERANCE_COUNT[member.def.tolerance] - used),
      mood: this.life.mood(member.def.id),
      emotions: this.life.emotions(member.def.id),
      misfireChance: this.director.previewMisfireChance(member.def.id),
      takeover: this.takeoverView(member),
    }
  }

  private viewersTrend(): -1 | 0 | 1 {
    const oneSecondAgo = Math.max(0, this.stepCount - STEPS_PER_SECOND)
    return viewersTrendOf(this.score.viewers, this.viewersByStep[oneSecondAgo])
  }

  /** gaze는 카메라 시야로, silence는 공간에 그릴 자리가 없어 뺀다. */
  private recentPhenomena(): RecentPhenomenon[] {
    return this.log
      .since(this.stepCount - PHENOMENON_DISPLAY_STEPS)
      .filter((event) => isPhenomenonShown(event))
      .map((event) => ({
        id: event.id,
        kind: event.kind,
        intensity: event.intensity,
        sourceId: event.sourceId,
        targetId: event.targetId,
        x: event.x,
        y: event.y,
        z: event.z,
        ageSeconds: (this.stepCount - event.step) * STEP_SECONDS,
        text: this.describe(event),
      }))
  }

  private staffView(view: Omit<StaffView, 'name' | 'misfireChance' | 'x' | 'y' | 'z'>): StaffView {
    const member = this.requireStaff(view.id)
    return {
      ...view,
      name: member.name,
      misfireChance: this.director.previewStaffMisfireChance(view.id),
      ...this.requireCamera(member.cameraId).position,
    }
  }

  private equipmentView(id: string): EquipmentView {
    const state = this.physics.equipmentState(id)
    if (state === undefined) throw new Error(`물리 월드에 없는 장비입니다: ${id}`)
    const def = this.equipment.get(id)
    if (def === undefined) throw new Error(`정의에 없는 장비입니다: ${id}`)
    const { position, rotation } = state
    return {
      id,
      kind: def.kind,
      x: position.x,
      y: position.y,
      z: position.z,
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      released: state.released,
    }
  }
}

/**
 * 입력 기록으로 방송을 처음부터 다시 돌린다(결정론 확인용). 광고 입력 뒤에는 바로 재개한다.
 * step 번호마다 입력 묶음이 하나다(Ruling 36). 끝나면 물리 월드를 해제한다.
 */
export async function replay(
  setup: BroadcastSetup,
  log: readonly InputRecord[],
  steps: number,
): Promise<BroadcastView> {
  const byStep = new Map<number, BroadcastInput[]>()
  for (const { step, input } of log) {
    const group = byStep.get(step) ?? []
    group.push(input)
    byStep.set(step, group)
  }

  const broadcast = await Broadcast.create(setup)
  try {
    while (broadcast.currentStep < steps && broadcast.phase !== 'ended') {
      broadcast.step(byStep.get(broadcast.currentStep) ?? [])
      if (broadcast.phase === 'adBreak') broadcast.resumeFromAd()
    }
    return broadcast.view()
  } finally {
    broadcast.dispose()
  }
}
