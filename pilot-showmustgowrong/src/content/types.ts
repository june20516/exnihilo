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
}

export type Weight = 'light' | 'normal' | 'heavy'
export type Tolerance = 'low' | 'normal' | 'high' | 'max'

export interface PerformerDef {
  id: string
  name: string
  shortName: string
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
}

export interface CornerDef {
  label: string
  startTag: string
}

export interface ShowDef {
  id: string
  name: string
  rating: 'TV-PG' | 'TV-14' | 'TV-MA'
  corners: [CornerDef, CornerDef, CornerDef]
  cameras: CameraDef[]
  homeSpots: FloorPoint[]
  benchSpot: FloorPoint
  /** 이탈한 출연자가 걸어가는 바닥 위치 */
  exit: FloorPoint
  audienceZone: { minX: number; maxX: number; minZ: number; maxZ: number }
}
