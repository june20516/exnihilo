import type { CameraDef, Pose, ShowDef } from "@/content/types";
import type { BroadcastView } from "@/sim/engineTypes";
import { inFrame } from "@/sim/broadcast";
import { floorDistance, normalizeDegrees, yawBetween } from "@/sim/vec";

/** size 1이 되는 거리(m). 이보다 멀면 작아지고 가까우면 커진다. */
const REFERENCE_DISTANCE = 5;
/** 카메라에 너무 붙은 대상의 size가 무한히 커지지 않게 하는 최소 거리(m) */
const MIN_DISTANCE = 0.5;

export type FeedKind = "actor" | "equipment" | "audience";

export interface FeedItem {
  kind: FeedKind;
  id: string;
  label: string;
  /** -1(화면 왼쪽 끝) ~ 1(오른쪽 끝). yaw가 커지는 쪽이 왼쪽이다. */
  screenX: number;
  /** 거리에 반비례하는 상대 크기 */
  size: number;
  /** 바닥에서 뜬 높이(m) x size. 멀수록 작게 뜬다. */
  heightOffset: number;
  pose: Pose | null;
  /** 클로즈업이 따라가는 대상 */
  highlighted: boolean;
}

/** 피드 계산에 필요한 view 부분 */
export type FeedView = Pick<
  BroadcastView,
  "actors" | "equipment" | "cameraAngles" | "cameraTargets" | "cameraSubjects"
>;

type AudienceZone = ShowDef["audienceZone"];

const EQUIPMENT_LABELS = { hangingLight: "조명", setWall: "세트 벽" } as const;
const AUDIENCE_LABEL = "관객석";

interface Placed {
  x: number;
  y: number;
  z: number;
}

/**
 * 카메라가 지금 잡은 출연자·장비·관객석을 카메라 방향 기준 화면 좌표로 투영한다.
 * 가림 판정은 엔진이 view.cameraSubjects에 담아 주므로 그 목록 안에서만 그린다.
 * 먼 것부터 가까운 것 순서라 뒤에서부터 그리면 된다.
 */
export function cameraFeed(
  view: FeedView,
  camera: CameraDef,
  audienceZone?: AudienceZone,
): FeedItem[] {
  const yaw = view.cameraAngles[camera.id] ?? camera.defaultAngle;
  const caught = new Set(view.cameraSubjects[camera.id] ?? []);
  const target = view.cameraTargets[camera.id] ?? null;
  const project = (
    kind: FeedKind,
    id: string,
    label: string,
    at: Placed,
    pose: Pose | null,
  ): { item: FeedItem; distance: number } => {
    const distance = Math.max(MIN_DISTANCE, floorDistance(camera.position, at));
    const size = REFERENCE_DISTANCE / distance;
    const offset = normalizeDegrees(yawBetween(camera.position, at) - yaw);
    const item: FeedItem = {
      kind,
      id,
      label,
      screenX: Math.max(-1, Math.min(1, -offset / (camera.fovDegrees / 2))),
      size,
      heightOffset: at.y * size,
      pose,
      highlighted: kind === "actor" && id === target,
    };
    return { item, distance };
  };

  const items = [
    ...view.actors
      .filter((actor) => !actor.departed && caught.has(actor.id))
      .map((actor) =>
        project("actor", actor.id, actor.name, actor, actor.pose),
      ),
    ...view.equipment
      .filter((equipment) => caught.has(equipment.id))
      .map((equipment) =>
        project(
          "equipment",
          equipment.id,
          EQUIPMENT_LABELS[equipment.kind],
          equipment,
          null,
        ),
      ),
  ];
  if (audienceZone !== undefined) {
    const center = {
      x: (audienceZone.minX + audienceZone.maxX) / 2,
      y: 0,
      z: (audienceZone.minZ + audienceZone.maxZ) / 2,
    };
    if (inFrame(camera, yaw, center)) {
      items.push(project("audience", "audience", AUDIENCE_LABEL, center, null));
    }
  }
  return items
    .sort((a, b) => b.distance - a.distance)
    .map((entry) => entry.item);
}
