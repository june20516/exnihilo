import type { CameraDef, EquipmentDef, Pose, ShowDef } from '@/content/types'
import { inFrame } from '@/sim/broadcast'
import type { BroadcastView } from '@/sim/engineTypes'
import { floorDistance, normalizeDegrees, yawBetween } from '@/sim/vec'

/** size 1이 되는 거리(m). 이보다 멀면 작아지고 가까우면 커진다. */
export const REFERENCE_DISTANCE = 5
/** 카메라에 너무 붙은 대상의 size가 무한히 커지지 않게 하는 최소 거리(m) */
export const MIN_DISTANCE = 0.5

export type FeedKind = 'actor' | 'equipment' | 'audience'
export type EquipmentKind = EquipmentDef['kind']

export interface FeedItem {
  kind: FeedKind
  id: string
  label: string
  /** -1(화면 왼쪽 끝) ~ 1(오른쪽 끝). yaw가 커지는 쪽이 왼쪽이다. */
  screenX: number
  /** 거리에 반비례하는 상대 크기 */
  size: number
  /** 바닥에서 뜬 높이(m) x size. 멀수록 작게 뜬다. */
  heightOffset: number
  /** 장비 종류. 출연자와 관객석은 null */
  equipmentKind: EquipmentKind | null
  pose: Pose | null
  /** 클로즈업이 따라가는 대상 */
  highlighted: boolean
}

/** 피드 계산에 필요한 view 부분 */
export type FeedView = Pick<
  BroadcastView,
  'actors' | 'equipment' | 'cameraAngles' | 'cameraTargets' | 'cameraSubjects'
>

export type AudienceZone = ShowDef['audienceZone']

const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
  hangingLight: '조명',
  setWall: '세트 벽',
}
const AUDIENCE_LABEL = '관객석'

interface Placed {
  x: number
  y: number
  z: number
}

interface Projection {
  kind: FeedKind
  id: string
  label: string
  at: Placed
  pose: Pose | null
  equipmentKind: EquipmentKind | null
}

/** 관객석 구역의 중심과 네 모서리. 하나라도 시야 안이면 관객석이 보인다. */
function audiencePoints(zone: AudienceZone): Placed[] {
  const { minX, maxX, minZ, maxZ } = zone
  return [
    { x: (minX + maxX) / 2, y: 0, z: (minZ + maxZ) / 2 },
    { x: minX, y: 0, z: minZ },
    { x: maxX, y: 0, z: minZ },
    { x: minX, y: 0, z: maxZ },
    { x: maxX, y: 0, z: maxZ },
  ]
}

/**
 * 카메라가 지금 잡은 출연자·장비·관객석을 카메라 방향 기준 화면 좌표로 투영한다.
 * 가림 판정은 엔진이 view.cameraSubjects에 담아 주므로 그 목록 안에서만 그린다.
 * 먼 것부터 가까운 것 순서라 앞에서부터 그리면 된다.
 */
export function cameraFeed(
  view: FeedView,
  camera: CameraDef,
  audienceZone: AudienceZone,
): FeedItem[] {
  const yaw = view.cameraAngles[camera.id] ?? camera.defaultAngle
  const caught = new Set(view.cameraSubjects[camera.id] ?? [])
  const target = view.cameraTargets[camera.id] ?? null

  const project = ({ kind, id, label, at, pose, equipmentKind }: Projection) => {
    const distance = Math.max(MIN_DISTANCE, floorDistance(camera.position, at))
    const size = REFERENCE_DISTANCE / distance
    const offset = normalizeDegrees(yawBetween(camera.position, at) - yaw)
    const item: FeedItem = {
      kind,
      id,
      label,
      screenX: Math.max(-1, Math.min(1, -offset / (camera.fovDegrees / 2))),
      size,
      heightOffset: at.y * size,
      equipmentKind,
      pose,
      highlighted: kind === 'actor' && id === target,
    }
    return { item, distance }
  }

  const projections: Projection[] = [
    ...view.actors
      .filter((actor) => !actor.departed && caught.has(actor.id))
      .map((actor): Projection => ({
        kind: 'actor',
        id: actor.id,
        label: actor.name,
        at: actor,
        pose: actor.pose,
        equipmentKind: null,
      })),
    ...view.equipment
      .filter((equipment) => caught.has(equipment.id))
      .map((equipment): Projection => ({
        kind: 'equipment',
        id: equipment.id,
        label: EQUIPMENT_LABELS[equipment.kind],
        at: equipment,
        pose: null,
        equipmentKind: equipment.kind,
      })),
  ]
  const visibleAudiencePoint = audiencePoints(audienceZone).find((point) =>
    inFrame(camera, yaw, point),
  )
  if (visibleAudiencePoint !== undefined) {
    projections.push({
      kind: 'audience',
      id: 'audience',
      label: AUDIENCE_LABEL,
      at: visibleAudiencePoint,
      pose: null,
      equipmentKind: null,
    })
  }
  return projections
    .map(project)
    .sort((a, b) => b.distance - a.distance)
    .map((entry) => entry.item)
}
