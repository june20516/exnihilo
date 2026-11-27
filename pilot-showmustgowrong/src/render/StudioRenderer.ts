import {
  Application,
  Assets,
  ColorMatrixFilter,
  Container,
  Graphics,
  Text,
  type Texture,
} from 'pixi.js'
import {
  CAPSULE,
  LIGHT_HALF_EXTENTS,
  NOISE_RADIUS,
  PHENOMENON_DISPLAY_SECONDS,
  SET_WALL_HALF_EXTENTS,
  SIGHT_RADIUS,
  STUDIO_DEPTH,
  STUDIO_WIDTH,
} from '@/content/balance'
import type { PerformerDef, ShowDef } from '@/content/types'
import type {
  ActorView,
  BroadcastView,
  DarkZone,
  EquipmentView,
  RecentPhenomenon,
  StaffView,
} from '@/sim/engineTypes'
import { type FloorPoint, type Vec3, yawBetween } from '@/sim/vec'
import {
  ActorFigure,
  CLOSEUP_RING_RADIUS_METERS,
  WALKED_OUT_ALPHA,
  drawCloseupRing,
  type ArtTextures,
  type TrackMark,
} from './actorFigure'
import { studioBackdropUrls } from './backdropArt'
import { COLORS } from './colors'
import {
  cameraFanFloorPoints,
  unprojectFloor,
  clipToFloor,
  depthKey,
  fitIso,
  floorEllipseRadii,
  projectIso,
  visibleBoxFaces,
  type IsoTransform,
  type Point,
} from './geometry'
import { pickHit, type HitShapes, type StudioHit } from './hitTest'
import { allPerformerArtUrls, assertPerformerArt } from './performerArt'
import { saturationPlan } from './saturationPlan'
import { StudioBackdrop, type StudioBackdropTextures } from './studioBackdrop'

export type { StudioHit } from './hitTest'

export type StudioMode = 'live' | 'intervention' | 'auto'

// 캔버스
/** host 크기를 읽지 못할 때 쓰는 논리 크기 */
const FALLBACK_WIDTH = 960
const FALLBACK_HEIGHT = 540
const FIT_PADDING = 16
const FONT_FAMILY = 'sans-serif'

// 바닥. 바닥·벽 그림은 studioBackdrop.ts가 깐다
const FLOOR_EDGE_WIDTH = 2
const SPOT_RADIUS_METERS = 0.35
const SPOT_ALPHA = 0.5
const DARKNESS_ALPHA = 0.6

// 카메라 시야
const FAN_ARC_STEPS = 16
const FAN_ON_AIR_FILL_ALPHA = 0.3
const FAN_ON_AIR_LINE_WIDTH = 2
const FAN_IDLE_LINE_WIDTH = 1.5
const FAN_IDLE_LINE_ALPHA = 0.4
const CAMERA_MARK_RADIUS = 5
/** 대상을 따라가는 카메라(끌어서 대상을 바꿀 수 있다)에 두르는 손잡이 고리 */
const CAMERA_HANDLE_RADIUS = 10
const CAMERA_HANDLE_LINE_WIDTH = 2
/** 카메라 표시를 잡았다고 보는 반경(px). 손잡이보다 조금 넉넉하다. */
const CAMERA_GRAB_RADIUS = 16
const AIM_PREVIEW_FILL_ALPHA = 0.25
const AIM_PREVIEW_LINE_WIDTH = 2.5

/** 카메라를 끌어 조준하는 중의 미리보기. 카메라가 floorPoint를 향한 시야를 그린다. */
export interface AimPreview {
  cameraId: string
  floorPoint: FloorPoint
}
const STUDIO_FLOOR = { minX: 0, maxX: STUDIO_WIDTH, minZ: 0, maxZ: STUDIO_DEPTH }

// 몸
const SHADOW_ALPHA = 0.35
/** 높이 1m 오를 때 그림자가 줄어드는 비율 */
const SHADOW_SHRINK_PER_METER = 0.15
const SHADOW_MIN_RATIO = 0.4
const ACTOR_OUTLINE_WIDTH = 2
const ACTOR_OUTLINE_ALPHA = 0.6
/** 출연자가 없을 때 이름표 테두리에 쓰는 색 */
const FALLBACK_PERFORMER_COLOR = '#FFFFFF'

// 머리 위 표시
const OVERHEAD_GAP = 6

// 스태프
const STAFF_HEIGHT_METERS = 1.6
const STAFF_HEAD_RATIO = 0.17
const STAFF_BODY_WIDTH_METERS = 0.5
const STAFF_HIT_PADDING_PX = 4
const STAFF_OUTLINE = {
  color: COLORS.actorOutline,
  width: ACTOR_OUTLINE_WIDTH,
  alpha: ACTOR_OUTLINE_ALPHA,
} as const
const STARTLED_FONT_SIZE = 12
const STARTLED_PADDING_X = 6
const STARTLED_PADDING_Y = 3
const RECOVERY_RADIUS = 7
const RECOVERY_LINE_WIDTH = 3

// 장비
const LIGHT_CORD_METERS = 1
const LIGHT_CORD_WIDTH = 2
/** 이 높이(m)보다 떠 있는 장비만 바닥 그림자를 그린다. */
const EQUIPMENT_SHADOW_MIN_HEIGHT = 0.3
const EQUIPMENT_EDGE_WIDTH = 1.5
const EQUIPMENT_EDGE_ALPHA = 0.5

// 현상
const NOISE_SPREAD_SECONDS = 0.5
const RING_LINE_WIDTH_PER_INTENSITY = 1.5
const IMPACT_STAR_POINTS = 5
const IMPACT_STAR_RADIUS_PER_INTENSITY = 6
const IMPACT_STAR_INNER_RATIO = 0.45
const ANGER_ARROW_MAX_METERS = 1.5
const ANGER_ARROW_WIDTH = 3
const ANGER_ARROW_HEAD = 8
const ANGER_MARK_RADIUS = 6
const PHENOMENON_HIT_RADIUS_PX = 14

// 개입·자동 슬로모션
const INTERVENTION_SATURATION = -0.75
const AUTO_SATURATION = -0.35
const VIGNETTE_LAYERS = 10
const VIGNETTE_LAYER_THICKNESS = 12
const VIGNETTE_MAX_ALPHA = 0.35
const AUTO_VIGNETTE_ALPHA = 0.5

/** 조명이 오른쪽 위 앞에서 비친다고 보고 면마다 밝기를 정한다. */
const LIGHT_DIRECTION: Vec3 = { x: 0.35, y: 1, z: 0.6 }
const FACE_MIN_BRIGHTNESS = 0.55

/** 출연자별 클로즈업 표시. 대상으로 삼은 카메라 중 하나라도 따라가는 중이면 following이다. */
function trackMarks(
  view: Pick<BroadcastView, 'cameraTargets' | 'cameraAimModes'>,
): Map<string, TrackMark> {
  const marks = new Map<string, TrackMark>()
  for (const [cameraId, actorId] of Object.entries(view.cameraTargets)) {
    if (actorId === null) continue
    const following = view.cameraAimModes[cameraId] === 'tracking'
    if (following || !marks.has(actorId)) marks.set(actorId, following ? 'following' : 'held')
  }
  return marks
}

interface StaffSprite {
  root: Graphics
  overhead: Container
  overheadMarks: Graphics
  startledTag: Container
}

/**
 * 스튜디오를 쿼터뷰로 그린다(spec 8.2 2단계). Plan 1처럼 매 draw마다 view를 읽어 다시 그린다.
 * 레이어는 floor(바닥 표시) → bodies(깊이 정렬한 몸과 장비) → overlays(머리 위 표시, 말풍선) 순이다.
 * 물리 좌표 → 화면 좌표는 geometry.ts의 projectIso가 맡는다.
 */
export class StudioRenderer {
  private readonly app: Application
  private readonly show: ShowDef
  private readonly world = new Container()
  private readonly backdrop: StudioBackdrop
  private readonly floorStatic = new Graphics()
  private readonly floorDynamic = new Graphics()
  private readonly bodies = new Container()
  private readonly overlays = new Container()
  private readonly overlayMarks = new Graphics()
  private readonly vignette = new Graphics()
  private readonly interventionFilter = new ColorMatrixFilter()
  private readonly autoFilter = new ColorMatrixFilter()
  /** 레이어마다 지금 걸어 둔 채도 필터. 같으면 다시 걸지 않는다 */
  private readonly appliedFilters = new WeakMap<Container, ColorMatrixFilter | null>()
  private readonly actorFigures = new Map<string, ActorFigure>()
  private readonly staffSprites = new Map<string, StaffSprite>()
  private readonly equipmentShapes = new Map<string, Graphics>()
  private transform: IsoTransform
  private logicalWidth: number
  private logicalHeight: number
  private mode: StudioMode = 'live'
  private lastView: BroadcastView | null = null
  private hits: HitShapes = { actors: [], staff: [], equipment: [], phenomena: [] }
  /** 마지막 draw에서 그린 카메라 표시의 캔버스 논리 좌표 */
  private cameraMarks = new Map<string, Point>()
  private aimPreview: AimPreview | null = null
  /** 초점을 둔 출연자. null이 아니면 다른 출연자를 흐리게 그린다 */
  private focusActorId: string | null = null
  private destroyed = false
  private readonly textures: ArtTextures
  /** 출연자 id → 출연자 색(#RRGGBB) */
  private readonly performerColors: ReadonlyMap<string, string>

  private constructor(
    app: Application,
    show: ShowDef,
    performers: readonly PerformerDef[],
    textures: ArtTextures,
    backdropTextures: StudioBackdropTextures,
    width: number,
    height: number,
  ) {
    this.app = app
    this.show = show
    this.textures = textures
    this.backdrop = new StudioBackdrop(backdropTextures)
    this.performerColors = new Map(performers.map((performer) => [performer.id, performer.color]))
    this.logicalWidth = width
    this.logicalHeight = height
    this.transform = fitIso(width, height, FIT_PADDING)
  }

  /**
   * 렌더러를 만들어 host에 캔버스를 붙인다. 캔버스 논리 크기는 host의 크기다.
   * 초기화(await)가 끝나기 전에 화면이 사라질 수 있으므로(React StrictMode의 이중 마운트 등)
   * AbortSignal을 받는다. 초기화 뒤 이미 abort됐다면 만들던 Pixi 앱을 바로 정리하고
   * `AbortError` DOMException으로 reject한다. 호출 쪽은 이 오류를 무시하면 된다.
   * performers는 무대와 대기석 출연자 전부다(이름표 색). 출연자 그림 30장과 스튜디오 면 그림 3장은 여기서 한 번 불러 둔다.
   */
  static async create(
    host: HTMLElement,
    show: ShowDef,
    performers: readonly PerformerDef[],
    signal?: AbortSignal,
  ): Promise<StudioRenderer> {
    // 그림이 빠진 출연자가 있으면 그리기 도중이 아니라 여기서 바로 알린다.
    assertPerformerArt(performers.map((performer) => performer.id))
    const backdropUrls = studioBackdropUrls()
    const width = host.clientWidth > 0 ? host.clientWidth : FALLBACK_WIDTH
    const height = host.clientHeight > 0 ? host.clientHeight : FALLBACK_HEIGHT
    const app = new Application()
    await app.init({
      width,
      height,
      background: COLORS.background,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    })
    let textures: ArtTextures
    let backdropTextures: StudioBackdropTextures
    try {
      // 한쪽이 실패하면 다른 쪽 로드는 끝까지 돌지만 결과를 쓰지 않고 앱을 정리한 뒤 오류를 그대로 던진다
      const [performerTextures, planeTextures] = await Promise.all([
        Assets.load<Texture>(allPerformerArtUrls()),
        Assets.load<Texture>(Object.values(backdropUrls)),
      ])
      textures = performerTextures
      backdropTextures = {
        floor: planeTextures[backdropUrls.floor],
        backWall: planeTextures[backdropUrls.backWall],
        sideWall: planeTextures[backdropUrls.sideWall],
      }
    } catch (error: unknown) {
      app.destroy({ removeView: true }, { children: true })
      throw error
    }
    if (signal?.aborted) {
      app.destroy({ removeView: true }, { children: true })
      throw new DOMException('StudioRenderer 생성이 취소되었습니다.', 'AbortError')
    }
    const renderer = new StudioRenderer(
      app,
      show,
      performers,
      textures,
      backdropTextures,
      width,
      height,
    )
    host.appendChild(app.canvas)
    renderer.buildScene()
    return renderer
  }

  /** 캔버스 논리 크기. 클릭 좌표를 clientToCanvas로 환산할 때 쓴다. */
  get size(): { width: number; height: number } {
    return { width: this.logicalWidth, height: this.logicalHeight }
  }

  draw(view: BroadcastView, mode: StudioMode): void {
    if (this.destroyed) return
    this.lastView = view
    this.drawFloorMarks(view)
    this.drawEquipment(view.equipment)
    this.drawActors(view)
    this.drawStaff(view.staff)
    this.drawPhenomenonMarks(view)
    this.applyMode(mode)
    // 출연자 그림은 처음 보일 때 만들어지므로 레이어 목록은 매 draw 다시 본다
    this.applySaturation()
  }

  /**
   * 캔버스 논리 좌표의 한 점 (px, py)에 있는 대상. 없으면 null.
   * 우선순위(종류 → 깊이)는 hitTest.ts의 pickHit이 정한다.
   */
  hitTest(px: number, py: number): StudioHit | null {
    return pickHit({ x: px, y: py }, this.hits)
  }

  /** (px, py)에서 CAMERA_GRAB_RADIUS 안에 있는 가장 가까운 카메라 표시의 id. 없으면 null. */
  cameraAt(px: number, py: number): string | null {
    let best: { id: string; distance: number } | null = null
    for (const [id, mark] of this.cameraMarks) {
      const distance = Math.hypot(px - mark.x, py - mark.y)
      if (distance > CAMERA_GRAB_RADIUS) continue
      if (best === null || distance < best.distance) best = { id, distance }
    }
    return best?.id ?? null
  }

  /** 캔버스 논리 좌표의 한 점 아래 바닥(y=0) 위치 */
  floorAt(px: number, py: number): FloorPoint {
    return unprojectFloor({ x: px, y: py }, this.transform)
  }

  /** 마지막 draw에서 그린 카메라 표시의 캔버스 논리 좌표. 없으면 null. */
  cameraAnchor(id: string): Point | null {
    return this.cameraMarks.get(id) ?? null
  }

  /** 끌어 조준하는 중의 시야 미리보기를 바꾸고 바로 다시 그린다. null이면 지운다. */
  setAimPreview(preview: AimPreview | null): void {
    this.aimPreview = preview
    if (!this.destroyed && this.lastView !== null) this.draw(this.lastView, this.mode)
  }

  /** actorId에 초점을 두고 다른 출연자를 흐리게 한다. null이면 모두 또렷하게 되돌린다. 바로 다시 그린다. */
  setFocus(actorId: string | null): void {
    if (actorId === this.focusActorId) return
    this.focusActorId = actorId
    if (!this.destroyed && this.lastView !== null) this.draw(this.lastView, this.mode)
  }

  /**
   * 마지막 draw에서 그린 출연자·스태프의 캔버스 논리 좌표(몸 중심). 화면에 없으면 null.
   * 개입 카드와 스튜디오의 대상을 선으로 잇는 데 쓴다.
   */
  anchorOf(kind: 'actor' | 'staff', id: string): Point | null {
    if (kind === 'actor') {
      return this.hits.actors.find((shape) => shape.id === id)?.center ?? null
    }
    const staff = this.hits.staff.find((shape) => shape.id === id)
    if (staff === undefined) return null
    return { x: (staff.left + staff.right) / 2, y: (staff.top + staff.bottom) / 2 }
  }

  /**
   * 마지막 draw에서 그린 출연자 그림의 반폭·반높이(캔버스 논리 좌표, 히트 여유 포함). 화면에 없으면 null.
   * 정보 카드가 출연자를 덮지 않게 몸 상자로 쓴다. 확대 비율에 따라 달라지는 실제 그림 크기다.
   */
  actorHalfSize(id: string): { halfWidth: number; halfHeight: number } | null {
    const shape = this.hits.actors.find((candidate) => candidate.id === id)
    return shape === undefined ? null : { halfWidth: shape.halfWidth, halfHeight: shape.halfHeight }
  }

  resize(width: number, height: number): void {
    if (this.destroyed || width <= 0 || height <= 0) return
    if (width === this.logicalWidth && height === this.logicalHeight) return
    this.logicalWidth = width
    this.logicalHeight = height
    this.transform = fitIso(width, height, FIT_PADDING)
    this.app.renderer.resize(width, height)
    this.drawFloorStatic()
    this.drawVignette()
    if (this.lastView !== null) this.draw(this.lastView, this.mode)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const layer of [this.world, ...this.saturationLayers()]) layer.filters = null
    this.interventionFilter.destroy()
    this.autoFilter.destroy()
    this.app.destroy({ removeView: true }, { children: true })
    this.actorFigures.clear()
    this.staffSprites.clear()
    this.equipmentShapes.clear()
    this.lastView = null
  }

  // ── 장면 구성 ─────────────────────────────────────────────

  private buildScene(): void {
    this.interventionFilter.saturate(INTERVENTION_SATURATION, false)
    this.autoFilter.saturate(AUTO_SATURATION, false)
    this.bodies.sortableChildren = true
    this.overlays.addChild(this.overlayMarks)
    this.world.addChild(
      this.backdrop.container,
      this.floorStatic,
      this.floorDynamic,
      this.bodies,
      this.overlays,
    )
    this.app.stage.addChild(this.world, this.vignette)
    // 2단계 배지의 깜박임은 방송 속도와 관계없이 실제 시간으로 돈다(spec 4.1).
    this.app.ticker.add(() => {
      const now = performance.now()
      for (const figure of this.actorFigures.values()) figure.blink(now)
    })
    this.drawFloorStatic()
    this.drawVignette()
  }

  private project(point: Vec3): Point {
    return projectIso(point, this.transform)
  }

  private floorPolygon(minX: number, maxX: number, minZ: number, maxZ: number): Point[] {
    return [
      this.project({ x: minX, y: 0, z: minZ }),
      this.project({ x: maxX, y: 0, z: minZ }),
      this.project({ x: maxX, y: 0, z: maxZ }),
      this.project({ x: minX, y: 0, z: maxZ }),
    ]
  }

  /**
   * 바뀌지 않는 바닥: 바닥·벽 그림 자리, 바닥 테두리, 관객석 테두리, home spot, 대기석, 출구.
   * 바닥 그림에 나무 판자 결이 있어 1m 격자선은 긋지 않는다. 관객석은 그림의 붉은 카펫이 보여 주므로 테두리만 긋는다.
   */
  private drawFloorStatic(): void {
    this.backdrop.layout(this.transform)
    const floor = this.floorStatic.clear()
    floor
      .poly(this.floorPolygon(0, STUDIO_WIDTH, 0, STUDIO_DEPTH))
      .stroke({ color: COLORS.floorEdge, width: FLOOR_EDGE_WIDTH })

    const { audienceZone, homeSpots, benchSpot, exit } = this.show
    const audience = this.floorPolygon(
      audienceZone.minX,
      audienceZone.maxX,
      audienceZone.minZ,
      audienceZone.maxZ,
    )
    floor.poly(audience).stroke({ color: COLORS.audienceZoneLine, width: FLOOR_EDGE_WIDTH })

    const spot = floorEllipseRadii(SPOT_RADIUS_METERS, this.transform.scale)
    for (const home of homeSpots) {
      const center = this.project({ x: home.x, y: 0, z: home.z })
      floor
        .ellipse(center.x, center.y, spot.rx, spot.ry)
        .stroke({ color: COLORS.homeSpot, width: FLOOR_EDGE_WIDTH, alpha: SPOT_ALPHA })
    }
    const bench = this.project({ x: benchSpot.x, y: 0, z: benchSpot.z })
    floor
      .ellipse(bench.x, bench.y, spot.rx, spot.ry)
      .stroke({ color: COLORS.benchSpot, width: FLOOR_EDGE_WIDTH, alpha: SPOT_ALPHA })
    const exitCenter = this.project({ x: exit.x, y: 0, z: exit.z })
    floor
      .ellipse(exitCenter.x, exitCenter.y, spot.rx, spot.ry)
      .fill({ color: COLORS.exit, alpha: SPOT_ALPHA })
  }

  private drawVignette(): void {
    this.vignette.clear()
    const width = this.logicalWidth
    const height = this.logicalHeight
    for (let layer = 0; layer < VIGNETTE_LAYERS; layer++) {
      const inset = layer * VIGNETTE_LAYER_THICKNESS
      const alpha = VIGNETTE_MAX_ALPHA * (1 - layer / VIGNETTE_LAYERS)
      this.vignette
        .rect(
          inset + VIGNETTE_LAYER_THICKNESS / 2,
          inset + VIGNETTE_LAYER_THICKNESS / 2,
          width - inset * 2 - VIGNETTE_LAYER_THICKNESS,
          height - inset * 2 - VIGNETTE_LAYER_THICKNESS,
        )
        .stroke({ color: COLORS.vignette, width: VIGNETTE_LAYER_THICKNESS, alpha })
    }
    this.vignette.visible = this.mode !== 'live'
  }

  /** 개입은 강하게, 자동 슬로모션은 약하게 가장자리를 어둡게 한다(채도는 applySaturation). */
  private applyMode(mode: StudioMode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.vignette.visible = mode !== 'live'
    this.vignette.alpha = mode === 'auto' ? AUTO_VIGNETTE_ALPHA : 1
  }

  /**
   * 개입은 강하게, 자동 슬로모션은 약하게 채도를 뺀다. 개입 중 고른 출연자(초점)의 몸과 머리 위 표시는
   * 필터 밖에 두어 밝게 남긴다(B2 spec 7절, saturationPlan).
   */
  private applySaturation(): void {
    const filter =
      this.mode === 'intervention' ? this.interventionFilter : this.mode === 'auto' ? this.autoFilter : null
    const focused = this.focusActorId === null ? undefined : this.actorFigures.get(this.focusActorId)
    const kept = focused === undefined ? [] : [focused.body, focused.overhead]
    const plan = saturationPlan(filter !== null, this.saturationLayers(), kept)
    this.setFilter(this.world, plan.world ? filter : null)
    for (const layer of plan.filtered) this.setFilter(layer, filter)
    for (const layer of plan.unfiltered) this.setFilter(layer, null)
  }

  /** world 안에서 채도 필터를 따로 걸 수 있는 레이어: 배경, 바닥, 몸·장비·스태프 하나하나, 머리 위 표시 하나하나 */
  private saturationLayers(): Container[] {
    return [
      this.backdrop.container,
      this.floorStatic,
      this.floorDynamic,
      ...this.bodies.children,
      ...this.overlays.children,
    ]
  }

  private setFilter(target: Container, filter: ColorMatrixFilter | null): void {
    if ((this.appliedFilters.get(target) ?? null) === filter) return
    this.appliedFilters.set(target, filter)
    target.filters = filter === null ? null : [filter]
  }

  // ── 바닥 표시 ─────────────────────────────────────────────

  /** 몸보다 먼저 그리는 바닥 표시: 어둠, 카메라 시야, 현상 링, 그림자, 클로즈업 대상 고리. */
  private drawFloorMarks(view: BroadcastView): void {
    const floor = this.floorDynamic.clear()
    this.drawDarkness(floor, view.darkZones)
    this.drawCameraFans(floor, view)
    this.drawPhenomenonRings(floor, view.recentPhenomena)
    this.drawShadows(floor, view)
    this.drawCloseupRings(floor, view)
  }

  /** 클로즈업 대상의 발밑 노란 점선 고리 */
  private drawCloseupRings(floor: Graphics, view: BroadcastView): void {
    const marks = trackMarks(view)
    const radii = floorEllipseRadii(CLOSEUP_RING_RADIUS_METERS, this.transform.scale)
    for (const actor of view.actors) {
      const mark = marks.get(actor.id)
      if (mark === undefined || actor.departed) continue
      drawCloseupRing(floor, this.project({ x: actor.x, y: 0, z: actor.z }), radii, mark)
    }
  }

  private drawDarkness(floor: Graphics, zones: readonly DarkZone[]): void {
    for (const zone of zones) {
      const center = this.project({ x: zone.x, y: 0, z: zone.z })
      const { rx, ry } = floorEllipseRadii(zone.radius, this.transform.scale)
      floor
        .ellipse(center.x, center.y, rx, ry)
        .fill({ color: COLORS.darkness, alpha: DARKNESS_ALPHA })
    }
  }

  private drawCameraFans(floor: Graphics, view: BroadcastView): void {
    // 송출 중인 시야가 다른 시야 위에 오도록 마지막에 그린다.
    const cameras = [...this.show.cameras].sort(
      (a, b) => Number(a.id === view.onAirCameraId) - Number(b.id === view.onAirCameraId),
    )
    this.cameraMarks.clear()
    for (const camera of cameras) {
      const onAir = camera.id === view.onAirCameraId
      const aiming = this.aimPreview?.cameraId === camera.id ? this.aimPreview : null
      const yaw =
        aiming === null
          ? (view.cameraAngles[camera.id] ?? camera.defaultAngle)
          : yawBetween(camera.position, aiming.floorPoint)
      const fan = cameraFanFloorPoints(
        camera.position,
        yaw,
        camera.fovDegrees,
        camera.range,
        FAN_ARC_STEPS,
      )
      const points = clipToFloor(fan, STUDIO_FLOOR).map((point) => this.project(point))
      const mark = this.project(fan[0])
      this.cameraMarks.set(camera.id, mark)
      floor
        .circle(mark.x, mark.y, CAMERA_MARK_RADIUS)
        .fill(onAir ? COLORS.cameraOnAirStroke : COLORS.cameraBody)
      if (camera.tracking === true) {
        floor
          .circle(mark.x, mark.y, CAMERA_HANDLE_RADIUS)
          .stroke({ color: COLORS.aimPreview, width: CAMERA_HANDLE_LINE_WIDTH })
      }
      if (aiming !== null) {
        const to = this.project({ x: aiming.floorPoint.x, y: 0, z: aiming.floorPoint.z })
        floor
          .moveTo(mark.x, mark.y)
          .lineTo(to.x, to.y)
          .stroke({ color: COLORS.aimPreview, width: AIM_PREVIEW_LINE_WIDTH })
        if (points.length >= 3) {
          floor
            .poly(points)
            .fill({ color: COLORS.aimPreview, alpha: AIM_PREVIEW_FILL_ALPHA })
            .poly(points)
            .stroke({ color: COLORS.aimPreview, width: AIM_PREVIEW_LINE_WIDTH })
        }
        continue
      }
      if (points.length < 3) continue
      if (onAir) {
        floor
          .poly(points)
          .fill({ color: COLORS.cameraOnAirFan, alpha: FAN_ON_AIR_FILL_ALPHA })
          .poly(points)
          .stroke({ color: COLORS.cameraOnAirStroke, width: FAN_ON_AIR_LINE_WIDTH })
      } else {
        floor.poly(points).stroke({
          color: COLORS.cameraFan,
          width: FAN_IDLE_LINE_WIDTH,
          alpha: FAN_IDLE_LINE_ALPHA,
        })
      }
    }
  }

  private drawPhenomenonRings(floor: Graphics, phenomena: readonly RecentPhenomenon[]): void {
    for (const item of phenomena) {
      const color = ringColor(item.kind)
      if (color === null) continue
      const fade = phenomenonFade(item)
      const fullRadius = item.kind === 'noise' ? NOISE_RADIUS[item.intensity] : SIGHT_RADIUS
      const radius =
        item.kind === 'noise'
          ? fullRadius * Math.min(1, item.ageSeconds / NOISE_SPREAD_SECONDS)
          : fullRadius
      if (radius <= 0) continue
      const center = this.project({ x: item.x, y: 0, z: item.z })
      const { rx, ry } = floorEllipseRadii(radius, this.transform.scale)
      floor.ellipse(center.x, center.y, rx, ry).stroke({
        color,
        width: RING_LINE_WIDTH_PER_INTENSITY * item.intensity,
        alpha: fade,
      })
    }
  }

  private drawShadows(floor: Graphics, view: BroadcastView): void {
    const scale = this.transform.scale
    for (const actor of view.actors) {
      if (actor.departed) continue
      // 서 있을 때 중심 높이(반 높이 + 반지름) 위로 뜬 만큼 그림자를 줄인다.
      const lift = Math.max(0, actor.y - (CAPSULE.halfHeight + CAPSULE.radius))
      const ratio = Math.max(SHADOW_MIN_RATIO, 1 - lift * SHADOW_SHRINK_PER_METER)
      const center = this.project({ x: actor.x, y: 0, z: actor.z })
      const { rx, ry } = floorEllipseRadii(CAPSULE.radius * ratio, scale)
      floor.ellipse(center.x, center.y, rx, ry).fill({
        color: COLORS.shadow,
        alpha: SHADOW_ALPHA * (actor.walkedOut ? WALKED_OUT_ALPHA : 1),
      })
    }
    for (const item of view.equipment) {
      if (item.kind !== 'hangingLight') continue
      if (item.y < EQUIPMENT_SHADOW_MIN_HEIGHT + LIGHT_HALF_EXTENTS.hy) continue
      const center = this.project({ x: item.x, y: 0, z: item.z })
      const { rx, ry } = floorEllipseRadii(LIGHT_HALF_EXTENTS.hx, scale)
      floor.ellipse(center.x, center.y, rx, ry).fill({ color: COLORS.shadow, alpha: SHADOW_ALPHA })
    }
  }

  // ── 몸(깊이 정렬) ─────────────────────────────────────────

  private drawEquipment(equipment: readonly EquipmentView[]): void {
    this.hits.equipment = []
    for (const item of equipment) {
      let shape = this.equipmentShapes.get(item.id)
      if (shape === undefined) {
        shape = new Graphics()
        this.equipmentShapes.set(item.id, shape)
        this.bodies.addChild(shape)
      }
      const isLight = item.kind === 'hangingLight'
      const half = isLight ? LIGHT_HALF_EXTENTS : SET_WALL_HALF_EXTENTS
      const baseColor = item.released
        ? COLORS.equipmentReleased
        : isLight
          ? COLORS.light
          : COLORS.setWall
      shape.clear()
      if (isLight && !item.released) {
        const top = this.project({ x: item.x, y: item.y + half.hy, z: item.z })
        const anchor = this.project({
          x: item.x,
          y: item.y + half.hy + LIGHT_CORD_METERS,
          z: item.z,
        })
        shape
          .moveTo(top.x, top.y)
          .lineTo(anchor.x, anchor.y)
          .stroke({ color: COLORS.lightCord, width: LIGHT_CORD_WIDTH })
      }
      const faces = visibleBoxFaces(item, half, item.rotation, this.transform)
      for (const face of faces) {
        shape
          .poly(face.corners)
          .fill(shade(baseColor, faceBrightness(face.normal)))
          .stroke({
            color: COLORS.actorOutline,
            width: EQUIPMENT_EDGE_WIDTH,
            alpha: EQUIPMENT_EDGE_ALPHA,
          })
      }
      const depth = depthKey(item)
      shape.zIndex = depth
      this.hits.equipment.push({ id: item.id, polygons: faces.map((face) => face.corners), depth })
    }
  }

  private drawActors(view: BroadcastView): void {
    this.hits.actors = []
    const context = {
      project: (point: Vec3): Point => this.project(point),
      scale: this.transform.scale,
      textures: this.textures,
    }
    for (const actor of view.actors) {
      const figure = this.actorFigures.get(actor.id) ?? this.createActorFigure(actor.id)
      const unfocused = this.focusActorId !== null && this.focusActorId !== actor.id
      const hit = figure.update(actor, { ...context, unfocused })
      if (hit !== null) this.hits.actors.push(hit)
    }
  }

  private createActorFigure(actorId: string): ActorFigure {
    const figure = new ActorFigure(this.performerColors.get(actorId) ?? FALLBACK_PERFORMER_COLOR)
    this.bodies.addChild(figure.body)
    this.overlays.addChild(figure.overhead)
    this.actorFigures.set(actorId, figure)
    return figure
  }

  private drawStaff(staff: readonly StaffView[]): void {
    this.hits.staff = []
    const scale = this.transform.scale
    const height = STAFF_HEIGHT_METERS * scale
    const headRadius = height * STAFF_HEAD_RATIO
    const bodyWidth = STAFF_BODY_WIDTH_METERS * scale
    for (const member of staff) {
      const sprite = this.staffSprites.get(member.id) ?? this.createStaffSprite(member)
      // 스태프는 담당 카메라 바로 아래 바닥에 선다.
      const feetPoint = { x: member.x, y: 0, z: member.z }
      const feet = this.project(feetPoint)
      const depth = depthKey(feetPoint)
      sprite.root
        .clear()
        .roundRect(
          -bodyWidth / 2,
          -(height - headRadius * 2),
          bodyWidth,
          height - headRadius * 2,
          bodyWidth / 3,
        )
        .fill(COLORS.staffBody)
        .stroke(STAFF_OUTLINE)
        .circle(0, -height + headRadius, headRadius)
        .fill(COLORS.staffHead)
        .stroke(STAFF_OUTLINE)
      sprite.root.position.set(feet.x, feet.y)
      sprite.root.zIndex = depth

      const headTop = feet.y - height
      sprite.overhead.position.set(feet.x, headTop - OVERHEAD_GAP)
      const marks = sprite.overheadMarks.clear()
      sprite.startledTag.visible = member.mode === 'startled'
      sprite.startledTag.position.set(0, -sprite.startledTag.height / 2)
      if (member.mode === 'recovering') {
        const cy = -RECOVERY_RADIUS
        const progress = Math.min(1, Math.max(0, member.recoveryProgress))
        marks
          .circle(0, cy, RECOVERY_RADIUS)
          .stroke({ color: COLORS.recoveryTrack, width: RECOVERY_LINE_WIDTH })
        if (progress > 0) {
          marks
            .arc(0, cy, RECOVERY_RADIUS, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
            .stroke({ color: COLORS.recoveryFill, width: RECOVERY_LINE_WIDTH })
        }
      }

      this.hits.staff.push({
        id: member.id,
        left: feet.x - bodyWidth / 2 - STAFF_HIT_PADDING_PX,
        right: feet.x + bodyWidth / 2 + STAFF_HIT_PADDING_PX,
        top: headTop - STAFF_HIT_PADDING_PX,
        bottom: feet.y + STAFF_HIT_PADDING_PX,
        depth,
      })
    }
  }

  private createStaffSprite(member: StaffView): StaffSprite {
    const root = new Graphics()
    this.bodies.addChild(root)
    const overhead = new Container()
    const overheadMarks = new Graphics()
    const startledTag = createTag(
      '놀람!',
      COLORS.startledBubble,
      COLORS.startledText,
      STARTLED_FONT_SIZE,
      { x: STARTLED_PADDING_X, y: STARTLED_PADDING_Y },
    )
    overhead.addChild(overheadMarks, startledTag)
    this.overlays.addChild(overhead)
    const sprite: StaffSprite = { root, overhead, overheadMarks, startledTag }
    this.staffSprites.set(member.id, sprite)
    return sprite
  }

  // ── 몸 위 현상 표시 ───────────────────────────────────────

  /** 몸 위에 그리는 현상(충격 별, 분노 화살표)과 hitTest용 현상 중심. */
  private drawPhenomenonMarks(view: BroadcastView): void {
    const marks = this.overlayMarks.clear()
    this.hits.phenomena = []
    const actors = new Map(view.actors.map((actor) => [actor.id, actor]))
    for (const item of view.recentPhenomena) {
      if (item.kind === 'darkness') continue
      const fade = phenomenonFade(item)
      const isRing = ringColor(item.kind) !== null
      const anchor: Vec3 = isRing ? { x: item.x, y: 0, z: item.z } : item
      const point = this.project(anchor)
      this.hits.phenomena.push({
        id: item.id,
        center: point,
        radius: PHENOMENON_HIT_RADIUS_PX,
        depth: depthKey(anchor),
      })

      if (item.kind === 'impact') {
        const radius = IMPACT_STAR_RADIUS_PER_INTENSITY * (item.intensity + 1)
        marks
          .star(point.x, point.y, IMPACT_STAR_POINTS, radius, radius * IMPACT_STAR_INNER_RATIO)
          .fill({ color: COLORS.impact, alpha: fade })
          .stroke({ color: COLORS.actorOutline, width: 1.5, alpha: fade })
      } else if (item.kind === 'anger') {
        this.drawAngerMark(marks, item, actors, fade)
      }
    }
  }

  /** 출처에서 대상 쪽으로 향하는 짧은 화살표. 대상이 없으면 출처에 작은 분노 표시만 둔다. */
  private drawAngerMark(
    marks: Graphics,
    item: RecentPhenomenon,
    actors: ReadonlyMap<string, ActorView>,
    alpha: number,
  ): void {
    const source = actors.get(item.sourceId) ?? item
    const target = item.targetId === null ? undefined : actors.get(item.targetId)
    const from = this.project(source)
    if (target === undefined) {
      marks.circle(from.x, from.y, ANGER_MARK_RADIUS).fill({ color: COLORS.anger, alpha })
      return
    }
    const dx = target.x - source.x
    const dy = target.y - source.y
    const dz = target.z - source.z
    const length = Math.hypot(dx, dy, dz)
    if (length === 0) return
    const reach = Math.min(length, ANGER_ARROW_MAX_METERS) / length
    const to = this.project({
      x: source.x + dx * reach,
      y: source.y + dy * reach,
      z: source.z + dz * reach,
    })
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const wing = Math.PI / 6
    marks
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ color: COLORS.anger, width: ANGER_ARROW_WIDTH, alpha })
      .poly([
        to,
        {
          x: to.x - Math.cos(angle - wing) * ANGER_ARROW_HEAD,
          y: to.y - Math.sin(angle - wing) * ANGER_ARROW_HEAD,
        },
        {
          x: to.x - Math.cos(angle + wing) * ANGER_ARROW_HEAD,
          y: to.y - Math.sin(angle + wing) * ANGER_ARROW_HEAD,
        },
      ])
      .fill({ color: COLORS.anger, alpha })
  }
}

/** 최근 현상의 불투명도. 생길 때 1에서 표시 시간이 끝날 때 0으로 줄어든다. */
function phenomenonFade(item: RecentPhenomenon): number {
  return Math.max(0, 1 - item.ageSeconds / PHENOMENON_DISPLAY_SECONDS)
}

/** 바닥 링으로 그리는 현상의 색. 링이 아니면 null. */
function ringColor(kind: RecentPhenomenon['kind']): number | null {
  switch (kind) {
    case 'noise':
      return COLORS.noise
    case 'laughter':
      return COLORS.laughter
    case 'exposure':
      return COLORS.exposure
    default:
      return null
  }
}

function faceBrightness(normal: Vec3): number {
  const length = Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y, LIGHT_DIRECTION.z)
  const lit =
    (normal.x * LIGHT_DIRECTION.x + normal.y * LIGHT_DIRECTION.y + normal.z * LIGHT_DIRECTION.z) /
    length
  return FACE_MIN_BRIGHTNESS + (1 - FACE_MIN_BRIGHTNESS) * Math.max(0, lit)
}

/** 0xRRGGBB 색의 밝기를 factor배 한다. */
function shade(color: number, factor: number): number {
  const channel = (shift: number): number =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor))
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/** 둥근 사각형 배경 위 글자 태그. 가운데가 원점이다. */
function createTag(
  text: string,
  background: number,
  color: number,
  fontSize: number,
  padding: Point,
): Container {
  const label = new Text({
    text,
    style: { fill: color, fontSize, fontWeight: 'bold', fontFamily: FONT_FAMILY },
  })
  label.anchor.set(0.5)
  const width = label.width + padding.x * 2
  const height = label.height + padding.y * 2
  const back = new Graphics()
    .roundRect(-width / 2, -height / 2, width, height, height / 2)
    .fill(background)
    .stroke({ color: COLORS.actorOutline, width: 1.5 })
  const tag = new Container()
  tag.addChild(back, label)
  tag.visible = false
  return tag
}
