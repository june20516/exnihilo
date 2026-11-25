import type {
  EquipmentDef,
  GaugeKind,
  PerformerDef,
  Pose,
  ShowDef,
  StaffDef,
} from '@/content/types'
import type { AdEffect } from './director'

export type BroadcastInput =
  | { type: 'switch'; cameraId: string }
  | { type: 'direct'; actorId: string; directiveId: string }
  | { type: 'directStaff'; staffId: string; directiveId: string }
  | { type: 'ad'; effects: AdEffect[] }

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
  angle: number
  pose: Pose
  onAir: boolean
  walkedOut: boolean
  /** 이탈 뒤 물리 월드에서 빠졌다. walkedOut이지만 departed가 아니면 아직 출구로 걸어가는 중이다. */
  departed: boolean
  directivesLeft: number
}

export interface EquipmentView {
  id: string
  kind: EquipmentDef['kind']
  x: number
  y: number
  angle: number
  released: boolean
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
  cameraAngles: Record<string, number>
  actors: ActorView[]
  equipment: EquipmentView[]
  viewers: number
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
