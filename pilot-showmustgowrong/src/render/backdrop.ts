import { STUDIO_DEPTH, STUDIO_WIDTH } from '@/content/balance'
import type { BackdropKind } from '@/content/types'
import type { Vec3 } from '@/sim/vec'
import { ISO_VIEW_HEIGHT, projectIso, type IsoTransform, type Point } from './geometry'

// ── 카메라 화면 배경 ─────────────────────────────────────────

/** 카메라 화면 배경 그림(feed-stage.jpg, feed-audience.jpg)의 원본 크기(px). 두 장이 같다 */
export const FEED_BACKDROP_SOURCE = { width: 1376, height: 768 } as const

/** 배경 그림 위의 가로선들. 모두 그림 높이 대비 비율(0 위 ~ 1 아래)이다 */
export interface FeedBackdropSpec {
  /** 벽과 바닥이 만나는 선(그림을 불러오기 전 단색 벽·바닥의 경계) */
  horizon: number
  /** 출연자·장비 발 기준선 */
  foot: number
  /** 관객 점을 놓는 영역 위·아래 */
  crowdTop: number
  crowdBottom: number
}

/**
 * 원본 픽셀로 잰 값(가운데 세로 띠).
 * - stage: 뒷벽 아래선 y≈470(0.615). 발 기준선은 그보다 아래 나무 바닥 위(y≈615)라 출연자가 무대 바닥에 선다.
 *   관객석은 무대 카메라에 보통 잡히지 않지만 잡히면 바닥 띠(0.65~0.85)에 둔다.
 * - audience: 좌석 영역 y≈300~576(0.39~0.75). 그 아래(y≈600~)는 바닥이라 발 기준선을 거기에 둔다.
 */
export const FEED_BACKDROPS: Readonly<Record<BackdropKind, FeedBackdropSpec>> = {
  stage: { horizon: 0.615, foot: 0.8, crowdTop: 0.65, crowdBottom: 0.85 },
  audience: { horizon: 0.39, foot: 0.9, crowdTop: 0.39, crowdBottom: 0.75 },
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 원본 비율을 지키며 캔버스를 빈틈없이 덮는 그림 자리(cover). 넘치는 쪽은 가운데를 기준으로 잘린다 */
export function coverRect(
  width: number,
  height: number,
  source: { width: number; height: number },
): Rect {
  const scale = Math.max(width / source.width, height / source.height)
  const drawWidth = source.width * scale
  const drawHeight = source.height * scale
  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  }
}

/** 카메라 화면 한 장의 배경 자리와 가로선(캔버스 px) */
export interface FeedBackdropLayout {
  image: Rect
  horizonY: number
  footY: number
  crowdTop: number
  crowdBottom: number
}

/**
 * 배경 그림이 놓일 자리와 그 위 가로선들의 캔버스 좌표. 원본 크기는 상수라
 * 그림을 불러오기 전(단색 배경)에도 같은 자리를 쓴다(불러온 순간 출연자가 튀지 않는다).
 */
export function feedBackdropLayout(
  kind: BackdropKind,
  width: number,
  height: number,
): FeedBackdropLayout {
  const image = coverRect(width, height, FEED_BACKDROP_SOURCE)
  const spec = FEED_BACKDROPS[kind]
  const lineY = (ratio: number) => image.y + image.height * ratio
  return {
    image,
    horizonY: lineY(spec.horizon),
    footY: lineY(spec.foot),
    crowdTop: lineY(spec.crowdTop),
    crowdBottom: lineY(spec.crowdBottom),
  }
}

const CROWD_DOTS = 40
/** 점 반지름 = 그림 높이 × 이 비율 × 크기 */
const CROWD_DOT_RADIUS_RATIO = 0.012
/** 점 무리 가로 반폭 = 캔버스 폭 × 이 비율 × 크기 */
const CROWD_SPREAD_RATIO = 0.2
/** 점 무리의 세로 납작함(가로 퍼짐 대비). 관객 영역보다 크면 영역 높이로 줄인다 */
const CROWD_FLATTEN = 0.4
/** 관객 점을 퍼뜨리는 황금각(라디안) */
const GOLDEN_ANGLE = 2.399963

export interface CrowdDots {
  dots: Point[]
  radius: number
  /** 점 무리 맨 위(이름표를 붙이는 자리) */
  top: number
}

/**
 * 관객석을 점 무리로 그릴 자리. 황금각으로 결정적으로 퍼뜨리고, 점이 관객 영역
 * (crowdTop~crowdBottom) 밖으로 나가지 않게 세로 퍼짐과 반지름을 줄인다.
 */
export function crowdDots(
  centerX: number,
  size: number,
  canvasWidth: number,
  layout: FeedBackdropLayout,
): CrowdDots {
  const bandHeight = layout.crowdBottom - layout.crowdTop
  const radius = Math.min(layout.image.height * CROWD_DOT_RADIUS_RATIO * size, bandHeight / 4)
  const spreadX = canvasWidth * CROWD_SPREAD_RATIO * size
  const spreadY = Math.min(spreadX * CROWD_FLATTEN, bandHeight / 2 - radius)
  const centerY = (layout.crowdTop + layout.crowdBottom) / 2
  const dots: Point[] = []
  for (let index = 0; index < CROWD_DOTS; index += 1) {
    const reach = Math.sqrt(index / CROWD_DOTS)
    const angle = index * GOLDEN_ANGLE
    dots.push({
      x: centerX + Math.cos(angle) * spreadX * reach,
      y: centerY + Math.sin(angle) * spreadY * reach,
    })
  }
  return { dots, radius, top: centerY - spreadY - radius }
}

// ── 스튜디오(쿼터뷰) 면 ───────────────────────────────────────

/** 렌더러가 그리는 벽 높이(m). fitIso가 화면에 담는 높이와 같다 */
export const STUDIO_WALL_HEIGHT = ISO_VIEW_HEIGHT

/**
 * 그림을 붙일 평면. origin은 그림 왼쪽 위 모서리의 월드 점, u는 그림 가로(왼→오),
 * v는 그림 세로(위→아래) 방향의 월드 벡터다(길이 = 면의 크기).
 */
export interface StudioPlane {
  origin: Vec3
  u: Vec3
  v: Vec3
}

export type StudioPlaneId = 'floor' | 'backWall' | 'sideWall'

export const STUDIO_PLANES: Readonly<Record<StudioPlaneId, StudioPlane>> = {
  // 위에서 본 평면도: 그림 위가 뒤(z=0), 왼쪽이 관객석(x=0)
  floor: {
    origin: { x: 0, y: 0, z: 0 },
    u: { x: STUDIO_WIDTH, y: 0, z: 0 },
    v: { x: 0, y: 0, z: STUDIO_DEPTH },
  },
  // z=0 면을 앞에서 본다: 그림 왼쪽이 x=0
  backWall: {
    origin: { x: 0, y: STUDIO_WALL_HEIGHT, z: 0 },
    u: { x: STUDIO_WIDTH, y: 0, z: 0 },
    v: { x: 0, y: -STUDIO_WALL_HEIGHT, z: 0 },
  },
  // x=0 면을 +x 쪽에서 본다: 화면에서 z=10이 왼쪽, z=0(뒷벽과 만나는 모서리)이 오른쪽
  sideWall: {
    origin: { x: 0, y: STUDIO_WALL_HEIGHT, z: STUDIO_DEPTH },
    u: { x: 0, y: 0, z: -STUDIO_DEPTH },
    v: { x: 0, y: -STUDIO_WALL_HEIGHT, z: 0 },
  },
}

/** 2D 아핀 행렬(Pixi Matrix와 같은 꼴): 화면 = (a·u + c·v + tx, b·u + d·v + ty) */
export interface AffineMatrix {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

/**
 * 텍스처 픽셀 (u, v)를 그 평면의 화면 점으로 보내는 행렬. 쿼터뷰 투영은 평면 위에서 아핀이라
 * 세 모서리(원점, u 끝, v 끝)만 투영하면 네 번째 모서리도 맞는다.
 */
export function planeMatrix(
  plane: StudioPlane,
  textureWidth: number,
  textureHeight: number,
  transform: IsoTransform,
): AffineMatrix {
  const origin = projectIso(plane.origin, transform)
  const uEnd = projectIso(addVec(plane.origin, plane.u), transform)
  const vEnd = projectIso(addVec(plane.origin, plane.v), transform)
  return {
    a: (uEnd.x - origin.x) / textureWidth,
    b: (uEnd.y - origin.y) / textureWidth,
    c: (vEnd.x - origin.x) / textureHeight,
    d: (vEnd.y - origin.y) / textureHeight,
    tx: origin.x,
    ty: origin.y,
  }
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}
