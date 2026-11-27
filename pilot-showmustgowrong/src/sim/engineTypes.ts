import type {
  EmotionId,
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
import type { EmotionView, MoodView } from './life'
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

/** 출연자 지시가 지금 이어받을 사고(spec Plan B1 3.3) */
export interface TakeoverView {
  /** 이어받을 사고 id */
  eventId: number
  /** 사고 로그와 같은 문구(describeEvent) */
  text: string
  /** 남은 몸 초(0 초과) */
  remainingBodySeconds: number
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
  /** 대표 감정(living spec 6). mind가 없거나 이탈했으면 null */
  mood: MoodView | null
  /** 감정마다의 값·단계·이유. mind가 없거나 이탈했으면 빈 배열 */
  emotions: EmotionView[]
  /** 지금 지시하면 엇나갈 확률(0~1) */
  misfireChance: number
  /** 지금 지시하면 이어받을 사고. 없거나 이탈했으면 null */
  takeover: TakeoverView | null
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

/**
 * 카메라가 지금 무엇을 따라 방향을 정하는지. tracking: 추적 대상을 따라감,
 * directed: 스태프 지시 방향으로 고정(PD가 대상을 다시 고르면 tracking), startled: 맡은 스태프가
 * 놀라 휘둘렀거나 복귀 중(StaffMode가 normal이 아님), fixed: 기본 방향(추적 카메라가 아니거나 대상 없음).
 */
export type CameraAimMode = 'tracking' | 'directed' | 'startled' | 'fixed'

/** 카메라를 맡은 스태프. 위치는 담당 카메라 자리다. */
export interface StaffView {
  id: string
  name: string
  cameraId: string
  mode: StaffMode
  /** 놀란 순간 0에서 복구 완료 1까지(유지+복귀 전체 기준). 평상시 1. */
  recoveryProgress: number
  /** 지금 지시하면 엇나갈 확률(0~1). 스태프 피로로 정해진다. */
  misfireChance: number
  x: number
  y: number
  z: number
}

/**
 * 로그 줄 종류. habit: 버릇(응답 포함), stage: 감정 단계 진입, incident: 사고(현상, 터짐, 이탈, 시선, 행동 줄),
 * staff: 스태프 놀람·복구, silence: 정적 단계.
 */
export type LogKind = 'habit' | 'stage' | 'incident' | 'staff' | 'silence'

/** 사고 로그 한 줄. eventId가 null이면 현상이 아닌 서술(이탈, 스태프 행동, 단계 진입)이다. */
export interface LogLine {
  /** 방송 시작부터 이어지는 줄 번호. 묶이지 않은 반복 문장도 줄을 구분한다. */
  index: number
  /** 처음 찍힌 스텝(묶여도 바뀌지 않는다) */
  step: number
  text: string
  kind: LogKind
  /** stage 줄과 감정 터짐 줄의 감정. 그 밖은 null */
  emotion: EmotionId | null
  /** 같은 text·kind가 연달아 나와 묶인 횟수(1부터) */
  repeat: number
  depth: number
  /** 버릇·터짐 줄은 처음 내뿜은 현상의 id다(L3) */
  eventId: number | null
  /** 묶인 줄이 가진 마지막 사건의 id. 묶이지 않았으면 eventId와 같다. 첫~마지막 id 범위로 강조한다. */
  lastEventId: number | null
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

/** 어둠이 덮은 바닥 원(EquipmentDef.darknessZone과 같은 모양) */
export interface DarkZone {
  x: number
  z: number
  radius: number
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
  /** 카메라별 조준 상태. 대상이 있어도 지시로 고정됐으면 directed다. */
  cameraAimModes: Record<string, CameraAimMode>
  /**
   * 카메라별로 지금 시야에 잡힌 출연자와 장비 id(장비 가림까지 반영). 이탈한 출연자는 없다.
   * 관객석 구역 중앙이 잡히면 'audience'도 든다(관객 소음의 송출 판정과 같은 기준).
   */
  cameraSubjects: Record<string, string[]>
  staff: StaffView[]
  actors: ActorView[]
  equipment: EquipmentView[]
  viewers: number
  /** 1초 전보다 늘었으면 1, 줄었으면 -1, 비슷하면 0 */
  viewersTrend: -1 | 0 | 1
  /** 최근 PHENOMENON_DISPLAY_SECONDS초의 현상 */
  recentPhenomena: RecentPhenomenon[]
  /** 부서진 조명이 만든 어둠 원. 방송이 끝날 때까지 남는다. */
  darkZones: DarkZone[]
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
  /** 강도 1 이상인 사건 수(기척 제외) */
  eventCount: number
  maxChainDepth: number
  /** 가장 깊은 연쇄(강도 1 이상)의 뿌리 사건이 남긴 로그 줄. 연쇄가 없으면 null */
  rootLine: { step: number; text: string } | null
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
