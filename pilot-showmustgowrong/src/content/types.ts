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
export type GaugeKind = 'sexual' | 'violence' | 'drugs' | 'language'

export type Pose = 'idle' | 'laugh' | 'angry' | 'panic' | 'flying' | 'fallen'

export type TargetSelector =
  | 'cause'
  | 'self'
  | 'none'
  | 'onAirCamera'
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

export interface MoveDef {
  type: 'dash' | 'leap' | 'flee' | 'home'
  toward: TargetSelector
  speed: number
}

export interface ActionDef {
  pose: Pose
  move?: MoveDef
  emits: EmitDef[]
}

export interface ReactionDef {
  trigger: Trigger
  chance?: number
  action: ActionDef
}

export interface DirectiveDef {
  id: string
  label: string
  action: ActionDef
}

export type Weight = 'light' | 'normal' | 'heavy'
export type Tolerance = 'low' | 'normal' | 'high' | 'max'

export interface PerformerDef {
  id: string
  name: string
  shortName: string
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
  aim: 'default' | 'audience' | 'nearestPerformer'
}

export interface StaffDef {
  id: string
  name: string
  shortName: string
  cameraId: string
  reactions: ReactionDef[]
  directives: StaffDirectiveDef[]
}

export interface EquipmentDef {
  id: string
  name: string
  kind: 'hangingLight' | 'setWall'
  position: { x: number; y: number }
  breakAt: Intensity
  onBreak: EmitDef[]
  darknessZone?: { minX: number; maxX: number }
}

export interface CameraDef {
  id: string
  label: string
  position: { x: number; y: number }
  defaultAngle: number
  fovDegrees: number
  range: number
  shotIntensity: Intensity
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
  homeSpots: { x: number }[]
  benchSpot: { x: number }
  exitX: number
  audienceZone: { minX: number; maxX: number }
}
