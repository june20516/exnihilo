import { describe, expect, it } from "vitest";
import type { CameraDef } from "@/content/types";
import type { ActorView, EquipmentView } from "@/sim/engineTypes";
import { cameraFeed, type FeedView } from "./cameraFeed";

const CAMERA: CameraDef = {
  id: "cam",
  label: "카메라",
  position: { x: 0, y: 2, z: 0 },
  defaultAngle: 0,
  fovDegrees: 60,
  range: 20,
  shotIntensity: 1,
};

const AUDIENCE_ZONE = { minX: 10, maxX: 14, minZ: -2, maxZ: 2 };

function actor(
  id: string,
  x: number,
  z: number,
  overrides: Partial<ActorView> = {},
): ActorView {
  return {
    id,
    name: `이름 ${id}`,
    x,
    y: 1,
    z,
    up: { x: 0, y: 1, z: 0 },
    pose: "idle",
    onAir: true,
    walkedOut: false,
    departed: false,
    directivesLeft: 1,
    tension: 0,
    aboutToBurst: false,
    misfireChance: 0,
    ...overrides,
  };
}

function view(
  actors: ActorView[],
  overrides: Partial<FeedView> = {},
  equipment: EquipmentView[] = [],
): FeedView {
  return {
    actors,
    equipment,
    cameraAngles: { cam: 0 },
    cameraTargets: { cam: null },
    cameraSubjects: {
      cam: [...actors.map((a) => a.id), ...equipment.map((e) => e.id)],
    },
    ...overrides,
  };
}

/** 카메라(0, 0)에서 yaw 방향으로 distance만큼 떨어진 바닥 점 */
function polar(yaw: number, distance: number): { x: number; z: number } {
  const radians = (yaw * Math.PI) / 180;
  return { x: Math.cos(radians) * distance, z: Math.sin(radians) * distance };
}

const feedOf = (v: FeedView) => cameraFeed(v, CAMERA);
const actorItem = (v: FeedView, id: string) =>
  feedOf(v).find((item) => item.id === id);

describe("screenX", () => {
  it("카메라 정면은 0, 화각 끝은 왼쪽 -1과 오른쪽 1이다", () => {
    const center = polar(0, 10);
    const left = polar(30, 10);
    const right = polar(-30, 10);
    const v = view([
      actor("c", center.x, center.z),
      actor("l", left.x, left.z),
      actor("r", right.x, right.z),
    ]);
    expect(actorItem(v, "c")?.screenX).toBeCloseTo(0);
    expect(actorItem(v, "l")?.screenX).toBeCloseTo(-1);
    expect(actorItem(v, "r")?.screenX).toBeCloseTo(1);
  });

  it("yaw가 커지는 쪽이 화면 왼쪽이다", () => {
    const point = polar(10, 10);
    expect(
      actorItem(view([actor("a", point.x, point.z)]), "a")?.screenX,
    ).toBeLessThan(0);
  });

  it("카메라의 현재 yaw를 기준으로 한다", () => {
    const point = polar(90, 10);
    const v = view([actor("a", point.x, point.z)], {
      cameraAngles: { cam: 90 },
    });
    expect(actorItem(v, "a")?.screenX).toBeCloseTo(0);
  });
});

describe("size", () => {
  it("두 배 멀리 있으면 절반이다", () => {
    const near = polar(0, 5);
    const far = polar(0, 10);
    const v = view([actor("near", near.x, near.z), actor("far", far.x, far.z)]);
    const nearSize = actorItem(v, "near")?.size ?? 0;
    expect(actorItem(v, "far")?.size).toBeCloseTo(nearSize / 2);
  });
});

describe("목록", () => {
  it("가까운 것이 뒤에 온다", () => {
    const near = polar(0, 5);
    const far = polar(0, 10);
    const v = view([actor("near", near.x, near.z), actor("far", far.x, far.z)]);
    expect(feedOf(v).map((item) => item.id)).toEqual(["far", "near"]);
  });

  it("cameraSubjects에 없는 출연자와 장비는 그리지 않는다", () => {
    const point = polar(0, 5);
    const v = view([actor("hidden", point.x, point.z)], {
      cameraSubjects: { cam: [] },
    });
    expect(feedOf(v)).toEqual([]);
  });

  it("이탈한 출연자는 없다", () => {
    const point = polar(0, 5);
    const v = view([actor("gone", point.x, point.z, { departed: true })]);
    expect(feedOf(v)).toEqual([]);
  });

  it("추적 대상은 highlighted다", () => {
    const point = polar(0, 5);
    const other = polar(5, 5);
    const v = view(
      [actor("a", point.x, point.z), actor("b", other.x, other.z)],
      {
        cameraTargets: { cam: "a" },
      },
    );
    expect(actorItem(v, "a")?.highlighted).toBe(true);
    expect(actorItem(v, "b")?.highlighted).toBe(false);
  });

  it("높이 떠 있으면 heightOffset이 커지고 장비도 투영한다", () => {
    const point = polar(0, 10);
    const equipment: EquipmentView = {
      id: "light",
      kind: "hangingLight",
      x: point.x,
      y: 6,
      z: point.z,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      released: false,
    };
    const v = view([actor("a", point.x, point.z, { y: 3 })], {}, [equipment]);
    const item = actorItem(v, "a");
    const light = feedOf(v).find((entry) => entry.kind === "equipment");
    expect(item?.heightOffset).toBeGreaterThan(0);
    expect(light?.heightOffset).toBeGreaterThan(item?.heightOffset ?? 0);
  });

  it("관객석이 화각 안이면 audience 항목이 있다", () => {
    const v = view([], { cameraAngles: { cam: 0 } });
    expect(
      cameraFeed(v, CAMERA, AUDIENCE_ZONE).filter(
        (item) => item.kind === "audience",
      ),
    ).toHaveLength(1);
    expect(
      cameraFeed(v, CAMERA, { minX: -14, maxX: -10, minZ: -2, maxZ: 2 }).filter(
        (item) => item.kind === "audience",
      ),
    ).toEqual([]);
  });
});
