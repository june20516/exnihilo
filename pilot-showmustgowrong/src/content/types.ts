import type { FloorPoint, Vec3 } from '@/sim/vec'

export type PhenomenonKind =
  | 'gaze'
  | 'noise'
  | 'impact'
  | 'laughter'
  | 'anger'
  | 'darkness'
  | 'exposure'
  | 'silence'

export type Intensity = 1 | 2 | 3

/** 강도 0인 기척이 될 수 있는 현상 종류 */
export type StirKind = 'noise' | 'laughter' | 'anger' | 'exposure'

/** 0은 기척(출연자 버릇이 내는 아주 작은 낌새)이다. */
export type EventIntensity = 0 | Intensity

/** 정의 순서가 동시 초과 때의 우선순위다. */
export const GAUGE_KINDS = ['sexual', 'violence', 'drugs', 'language'] as const
export type GaugeKind = (typeof GAUGE_KINDS)[number]

export type Pose = 'idle' | 'laugh' | 'angry' | 'panic' | 'flying' | 'fallen'

export type TargetSelector =
  | 'cause'
  | 'self'
  | 'none'
  | 'onAirCamera'
  /** 송출 카메라가 지금 보는 방향의 화면 안쪽 바닥 지점(카메라 앞으로) */
  | 'onAirFrame'
  | 'nearestPerformer'
  | { tag: string }

export type Trigger =
  | {
      kind: Exclude<PhenomenonKind, 'gaze'>
      min: Intensity
      scope: 'perceived' | 'targetsSelf'
    }
  | { kind: 'gaze'; when: 'enter' }
  | { kind: 'gaze'; when: 'absentFor'; seconds: number }
  | { kind: 'corner'; tag: string }

export interface EmitDef {
  kind: Exclude<PhenomenonKind, 'gaze' | 'silence'>
  intensity: Intensity | 'causePlusOne'
  target: TargetSelector
}

/**
 * dash·leap·flee는 한 번 미는 충격이고, walk는 목표에 도착할 때까지(최대 WALK_MAX_SECONDS) 매 스텝 걷는다.
 */
export interface MoveDef {
  type: 'dash' | 'leap' | 'flee' | 'home' | 'walk'
  toward: TargetSelector
  speed: number
}

export interface ActionDef {
  pose: Pose
  move?: MoveDef
  emits: EmitDef[]
  /** 행동할 때 사고 로그에 남기는 한 줄(현상이 없는 행동도 무엇을 했는지 보이게 한다) */
  line?: string
}

export interface ReactionDef {
  trigger: Trigger
  chance?: number
  action: ActionDef
}

export interface DirectiveDef {
  id: string
  label: string
  /** 이 지시를 하면 어떻게 되는지 한 줄(판단 카드에 보인다) */
  expect: string
  action: ActionDef
  /** 지시받은 출연자 자신의 감정 변화 */
  moodShifts?: MoodShift[]
}

export type Weight = 'light' | 'normal' | 'heavy'
export type Tolerance = 'low' | 'normal' | 'high' | 'max'

export interface PerformerDef {
  id: string
  name: string
  shortName: string
  /** 화면에서 이 출연자를 가리키는 색(#RRGGBB). 출연자끼리 겹치지 않는다 */
  color: string
  /** 연쇄 역할 한 단어(예: "MC") */
  role: string
  /** 무엇을 받으면 무엇을 일으키는지 한 줄 */
  tendency: string
  presence: 1 | 2 | 3
  tolerance: Tolerance
  weight: Weight
  tags: string[]
  reactions: ReactionDef[]
  directives: DirectiveDef[]
  misfire: 'overdo' | 'awkward' | 'never'
  onAirGaugePerSecond?: Partial<Record<GaugeKind, number>>
  hitViolenceMultiplier?: number
  /** 없으면 감정·버릇·터짐이 없는 출연자다 */
  mind?: MindDef
}

export interface StaffDirectiveDef {
  id: string
  label: string
  /** 이 지시를 하면 어떻게 되는지 한 줄(판단 카드에 보인다) */
  expect: string
  aim: 'default' | 'audience' | 'nearestPerformer'
}

export interface StaffDef {
  id: string
  name: string
  shortName: string
  /** 역할 한 단어(예: "카메라 감독") */
  role: string
  /** 무엇을 받으면 무엇을 일으키는지 한 줄 */
  tendency: string
  cameraId: string
  reactions: ReactionDef[]
  directives: StaffDirectiveDef[]
  /** 반응한 상태의 유지·복귀 시간(spec 5.6). 없으면 balance의 STAFF_RECOVERY. */
  recovery?: StaffRecovery
}

export interface StaffRecovery {
  holdSeconds: number
  returnSeconds: number
}

/** 조명 position은 중심, 세트 벽 position.y는 바닥면이다(Ruling 12). */
export interface EquipmentDef {
  id: string
  name: string
  kind: 'hangingLight' | 'setWall'
  position: Vec3
  breakAt: Intensity
  onBreak: EmitDef[]
  /** 조명이 부서지면 어두워지는 바닥 원 */
  darknessZone?: { x: number; z: number; radius: number }
}

/** 카메라 화면에 까는 배경 그림 종류. stage: 무대 정면, audience: 관객석 정면 */
export const BACKDROP_KINDS = ['stage', 'audience'] as const
export type BackdropKind = (typeof BACKDROP_KINDS)[number]

export interface CameraDef {
  id: string
  label: string
  position: Vec3
  /** 기본 방향 yaw(도). +x가 0도, +z가 90도. */
  defaultAngle: number
  fovDegrees: number
  range: number
  shotIntensity: Intensity
  /** 대상 출연자를 따라 고개를 돌리는 카메라(클로즈업) */
  tracking?: boolean
  /** 카메라 화면 배경 그림. 화면 표시에만 쓰고 엔진은 읽지 않는다 */
  backdrop: BackdropKind
}

export interface CornerDef {
  label: string
  startTag: string
}

/** 자동 PD가 쓰는 컷 규칙. 카메라 id는 ShowDef.cameras 안에 있어야 한다. */
export interface AutoCutDef {
  /** 평소 컷 순서(카메라 id). 추적 카메라 차례마다 대상을 다음 출연자로 넘긴다 */
  rotation: string[]
  /** 출연자 사고 때 쓰는 추적 카메라 id */
  incidentCamera: string
  /** 장비·관객 사고 때 쓰는 카메라 id */
  fallbackCamera: string
}

export interface ShowDef {
  id: string
  name: string
  rating: 'TV-PG' | 'TV-14' | 'TV-MA'
  /** 극 중 방송 길이(분). 실제 방송 길이(BROADCAST_REAL_SECONDS)와의 비가 쇼 배율이다. */
  showMinutes: number
  /** 극 중 방송 시작 시각 */
  startTime: { hour: number; minute: number }
  /** 쇼 속성 태그(쇼 속성에 따라 버릇·터짐 문장이 갈린다) */
  traits: string[]
  corners: [CornerDef, CornerDef, CornerDef]
  cameras: CameraDef[]
  homeSpots: FloorPoint[]
  benchSpot: FloorPoint
  /** 이탈한 출연자가 걸어가는 바닥 위치 */
  exit: FloorPoint
  audienceZone: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** 자동 PD 컷 규칙 */
  autoCut: AutoCutDef
}

export const COMMON_EMOTIONS = ['irritation', 'excitement', 'anxiety', 'boredom'] as const
export type CommonEmotionId = (typeof COMMON_EMOTIONS)[number]
/** 공용 감정 id 또는 출연자 개인 감정 id */
export type EmotionId = string

export interface EmotionDef {
  id: EmotionId
  name: string
  stageNames: [string, string]
  /** 단계 진입 줄의 술어. 주어 다음에 붙는다. ['슬슬 짜증이 난다', '폭발 직전이다'] */
  stageLines: [string, string]
  /** 터짐 줄의 쌓임 문형. {reasons:을}·{reasons:에}·{reasons} 중 하나를 쓴다. 예: '{reasons:을} 참던' */
  accumulate: string
}

export interface EmotionThresholds {
  rise: [number, number]
  fall: [number, number]
  intense: number
}

export type Situation =
  | { kind: 'offScreen' }
  | { kind: 'onScreen' }
  | { kind: 'silence' }
  | { kind: 'nearTag'; tag: string; present: boolean }
  | { kind: 'showTrait'; trait: string }

/** 상황 이유를 로그에 적는 말. noun: 쌓임 줄의 명사('무시'), clause: 그 상황이 가장 클 때 주어 앞 관형절('한참 화면에 안 잡힌') */
export interface ReasonLabel {
  noun: string
  clause: string
}

export type SensitivityDef =
  | {
      emotion: EmotionId
      on: 'event'
      kind: Exclude<PhenomenonKind, 'gaze' | 'silence'>
      scope: 'perceived' | 'targetsSelf'
      amount: number
    }
  | {
      emotion: EmotionId
      on: 'situation'
      situation: Situation
      perShowMinute: number
      fadePerShowMinute?: number
      label: ReasonLabel
    }

/** 터짐 행동. line·targetLine은 주어 뒤 술어, targetLine은 {target}·{target:을}·{target:와}·{target:에게} 토큰을 쓴다 */
export interface BurstAction {
  action: ActionDef
  line: string
  targetLine?: string
  intenseLine?: string
}

export interface BurstDef {
  small: BurstAction
  big: BurstAction
}

export type HabitTarget = 'none' | 'nearestPerformer' | 'cause' | 'topContributor' | { tag: string }

export type HabitCondition =
  | { kind: 'onScreen' }
  | { kind: 'offScreen' }
  | { kind: 'nearTag'; tag: string; present: boolean }
  | { kind: 'showTrait'; trait: string }
  | { kind: 'stage'; emotion: EmotionId; atLeast: 1 | 2 }

export interface HabitDef {
  id: string
  /** 주어 뒤 술어: '코를 판다' */
  line: string
  /** '{target:을} 보며 킥킥댄다' */
  targetLine?: string
  /** '코를 파던' */
  recall: string
  /** '코 파기' — 기척의 label, 쌓임·원인 받기 줄의 명사 */
  noun: string
  /** 버릇이 일어날 때 출연자 머리 위에 잠시 뜨는 이모지(그래핌 1개) */
  emote: string
  pose: Pose
  move?: MoveDef
  stir?: { kind: StirKind; target: HabitTarget }
  weight: number
  /** 가중치 × (1 + factor × 값/100) */
  boost?: { emotion: EmotionId; factor: number }
  /** 모두 만족해야 뽑힌다 */
  when?: HabitCondition[]
  /** 있으면 응답 버릇: 버릇 시계로는 뽑히지 않고, 나를 향한 이 종류 현상(기척 포함)을 받으면 chance로 응수한다 */
  respondsTo?: { kinds: StirKind[]; chance: number }
}

export interface MoodShift {
  emotion: EmotionId
  amount: number
}

export interface MindDef {
  /** 공용 4개 + 개인 0~2개. 공용은 emotions.ts의 COMMON_EMOTION_DEFS를 펼쳐 넣는다 */
  emotions: EmotionDef[]
  baseline?: Partial<Record<EmotionId, number>>
  thresholds?: Partial<Record<EmotionId, EmotionThresholds>>
  sensitivities: SensitivityDef[]
  bursts: Record<EmotionId, BurstDef>
  habits: HabitDef[]
}
