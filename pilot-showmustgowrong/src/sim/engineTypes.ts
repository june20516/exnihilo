import type {
  EquipmentDef,
  GaugeKind,
  Intensity,
  PerformerDef,
  PhenomenonKind,
  Pose,
  ShowDef,
  StaffDef,
} from '@/content/types'
import type { AdEffect } from './director'
import type { Vec3 } from './vec'

export type BroadcastInput =
  | { type: 'switch'; cameraId: string }
  | { type: 'direct'; actorId: string; directiveId: string }
  | { type: 'directStaff'; staffId: string; directiveId: string }
  | { type: 'ad'; effects: AdEffect[] }
  /** 클로즈업 대상 바꾸기. 공짜이고 개입이 아니다(spec 3.1). */
  | { type: 'track'; cameraId: string; actorId: string }

export type Phase = 'live' | 'adBreak' | 'ended'

export interface BroadcastSetup {
  show: ShowDef
  performers: PerformerDef[]
  bench: PerformerDef[]
  staff: StaffDef[]
  equipment: EquipmentDef[]
  seed: number
}

export interface ActorView {
  id: string
  name: string
  x: number
  y: number
  z: number
  /** 몸의 위 방향 단위 벡터. 서 있으면 (0, 1, 0). */
  up: Vec3
  pose: Pose
  onAir: boolean
  walkedOut: boolean
  /** 이탈 뒤 물리 월드에서 빠졌다. walkedOut이지만 departed가 아니면 아직 출구로 걸어가는 중이다. */
  departed: boolean
  directivesLeft: number
  /** 다음 반응에 얼마나 가까운지 0~1(spec 8.2) */
  tension: number
  /** tension이 BURST_WARNING_TENSION 이상이라 "곧 터짐!"을 붙인다. */
  aboutToBurst: boolean
  /** 지금 지시하면 엇나갈 확률(0~1) */
  misfireChance: number
}

export interface EquipmentView {
  id: string
  kind: EquipmentDef['kind']
  x: number
  y: number
  z: number
  rotation: { x: number; y: number; z: number; w: number }
  released: boolean
}

/** startled: 놀란 방향 유지, recovering: 기준 방향으로 돌아오는 중(spec 5.6) */
export type StaffMode = 'normal' | 'startled' | 'recovering'

/** 카메라를 맡은 스태프. 위치는 담당 카메라 자리다. */
export interface StaffView {
  id: string
  name: string
  cameraId: string
  mode: StaffMode
  /** 놀란 순간 0에서 복구 완료 1까지(유지+복귀 전체 기준). 평상시 1. */
  recoveryProgress: number
  x: number
  y: number
  z: number
}

/** 사고 로그 한 줄. eventId가 null이면 현상이 아닌 서술(이탈, 스태프 행동)이다. */
export interface LogLine {
  /** 방송 시작부터 이어지는 줄 번호. 같은 문장이 반복돼도 줄을 구분한다. */
  index: number
  step: number
  text: string
  depth: number
  eventId: number | null
  x: number
  y: number
  z: number
}

/** 공간에 잠깐 그리는 최근 현상. gaze와 silence는 싣지 않는다. */
export interface RecentPhenomenon {
  id: number
  kind: PhenomenonKind
  intensity: Intensity
  /** 출연자, 장비 id, 'broadcast' 또는 'audience' */
  sourceId: string
  /** 분노처럼 대상이 있는 현상의 대상 id. 없으면 null */
  targetId: string | null
  x: number
  y: number
  z: number
  ageSeconds: number
  /** 사고 로그와 같은 문구 */
  text: string
}

/** 가장 최근의 자동 슬로모션 계기. step으로 새 계기인지 구분한다. */
export interface AutoSlowmo {
  gauge: GaugeKind | null
  eventId: number | null
  step: number
}

export interface BroadcastView {
  step: number
  phase: Phase
  cornerIndex: 0 | 1 | 2
  onAirCameraId: string
  /** 카메라별 현재 yaw(도). 추적, 스태프 놀람과 복구를 반영한 실제 방향이다. */
  cameraAngles: Record<string, number>
  /** 추적 카메라의 대상 출연자 id. 추적 카메라가 아니거나 대상이 없으면 null */
  cameraTargets: Record<string, string | null>
  staff: StaffView[]
  actors: ActorView[]
  equipment: EquipmentView[]
  viewers: number
  /** 1초 전보다 늘었으면 1, 줄었으면 -1, 비슷하면 0 */
  viewersTrend: -1 | 0 | 1
  /** 최근 PHENOMENON_DISPLAY_SECONDS초의 현상 */
  recentPhenomena: RecentPhenomenon[]
  gauges: Record<GaugeKind, number>
  limits: Record<GaugeKind, number>
  haltedBy: GaugeKind | null
  log: LogLine[]
  autoSlowmo: AutoSlowmo | null
  adsLeft: number
  /** 광고 외적 세팅으로 투입할 수 있는 대기 출연자 수. 0이면 UI가 그 효과를 막는다. */
  benchLeft: number
  fatigue: number
}

export interface ChainLine {
  step: number
  text: string
  depth: number
}

export interface BroadcastSummary {
  peakViewers: number
  averageViewers: number
  eventCount: number
  maxChainDepth: number
}

export interface InputRecord {
  step: number
  input: BroadcastInput
}

export class ShowValidationError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super(`콘텐츠 검증 오류:\n${errors.join('\n')}`)
    this.name = 'ShowValidationError'
    this.errors = errors
  }
}
