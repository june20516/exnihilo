import { Application, ColorMatrixFilter, Container, Graphics, Text } from 'pixi.js'
import { CAPSULE, LIGHT_HALF_EXTENTS, SET_WALL_HALF_EXTENTS } from '@/content/balance'
import type { CameraDef, ShowDef } from '@/content/types'
import type { ActorView, BroadcastView, LogLine } from '@/sim/engine'
import { COLORS, POSE_COLORS, POSE_SYMBOLS } from './colors'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PIXELS_PER_METER,
  cameraFanPoints,
  capsuleEndpoints,
  capsuleVerticalExtent,
  distanceToSegment,
  toScreen,
} from './geometry'

// 말풍선
const BUBBLE_SECONDS = 1.5
const BUBBLE_FADE_SECONDS = 0.3
const MAX_BUBBLES = 3
const BUBBLE_VERTICAL_OFFSET = 56
const BUBBLE_STACK_GAP = 8
const BUBBLE_WRAP_WIDTH = 260
const BUBBLE_PADDING_X = 10
const BUBBLE_PADDING_Y = 6
const BUBBLE_RADIUS = 10
const BUBBLE_ALPHA = 0.95
const BUBBLE_FONT_SIZE = 15
const SCREEN_MARGIN = 16

// 배경
const EXIT_HEIGHT_METERS = 2.2
const EXIT_FILL_ALPHA = 0.35
const AUDIENCE_FILL_ALPHA = 0.5
const AUDIENCE_LINE_ALPHA = 0.6
const SPOT_HALF_WIDTH = 24
const SPOT_LIFT = 3
const SPOT_LINE_WIDTH = 4
const FLOOR_LINE_WIDTH = 3
const ZONE_LINE_WIDTH = 2

// 카메라
const FAN_ARC_STEPS = 16
const FAN_ALPHA = 0.12
const FAN_ON_AIR_ALPHA = 0.2
const FAN_ON_AIR_LINE_WIDTH = 3
const CAMERA_DOT_RADIUS = 8

// 출연자
const ACTOR_HIT_PADDING_PX = 10
const ACTOR_OUTLINE_WIDTH = 2
const ACTOR_ON_AIR_OUTLINE_WIDTH = 4
const ACTOR_OUTLINE_ALPHA = 0.5
const WALKED_OUT_ALPHA = 0.5
const SYMBOL_FONT_SIZE = 28
const NAME_FONT_SIZE = 14
const TEXT_GAP = 4

// 슬로모션
const SLOWMO_SATURATION = -0.6
const VIGNETTE_LAYERS = 10
const VIGNETTE_LAYER_THICKNESS = 14
const VIGNETTE_MAX_ALPHA = 0.3

const FONT_FAMILY = 'sans-serif'

interface ActorSprite {
  root: Container
  body: Graphics
  symbol: Text
  label: Text
  /** 마지막으로 그린 pose와 송출 여부. 바뀔 때만 도형을 다시 그린다. */
  drawnKey: string | null
}

interface Bubble {
  root: Container
  width: number
  height: number
  /** 겹침을 피하기 전, 이벤트 위치 기준의 중심 좌표. */
  anchorX: number
  anchorY: number
  expiresAt: number
}

/**
 * 스튜디오를 도형으로 그린다. 물리 각도는 라디안·반시계(+y 위)이고
 * 카메라 각도는 도 단위·반시계다. 화면은 y가 아래로 늘어나므로 두 각도 모두 부호를 뒤집어 쓴다
 * (좌표 변환은 geometry.ts).
 */
export class StudioRenderer {
  private readonly app: Application
  private readonly show: ShowDef
  private readonly world = new Container()
  private readonly fans = new Graphics()
  private readonly equipmentLayer = new Container()
  private readonly actorLayer = new Container()
  private readonly bubbleLayer = new Container()
  private readonly vignette = new Graphics()
  private readonly slowmoFilter = new ColorMatrixFilter()
  private readonly actorSprites = new Map<string, ActorSprite>()
  private readonly equipmentShapes = new Map<string, Graphics>()
  private bubbles: Bubble[] = []
  private elapsedSeconds = 0
  /** 이미 처리한 가장 큰 LogLine.index. 첫 draw 전에는 null. */
  private lastLogIndex: number | null = null
  private slowmoActive = false
  private lastActors: ActorView[] = []
  private destroyed = false

  private constructor(app: Application, show: ShowDef) {
    this.app = app
    this.show = show
  }

  /**
   * 렌더러를 만들어 host에 캔버스를 붙인다. 초기화(await)가 끝나기 전에 화면이 사라질 수 있으므로
   * (React StrictMode의 이중 마운트 등) AbortSignal을 받는다. 초기화 뒤 이미 abort됐다면 만들던
   * Pixi 앱을 바로 정리하고 `AbortError` DOMException으로 reject한다. 호출 쪽은 이 오류를 무시하면 된다.
   *
   *   const controller = new AbortController()
   *   StudioRenderer.create(host, show, controller.signal).then(setRenderer, ignoreAbort)
   *   return () => controller.abort() // 만들어진 뒤라면 renderer.destroy()도 호출한다
   */
  static async create(
    host: HTMLElement,
    show: ShowDef,
    signal?: AbortSignal,
  ): Promise<StudioRenderer> {
    const app = new Application()
    await app.init({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      background: COLORS.background,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    })
    if (signal?.aborted) {
      app.destroy({ removeView: true }, { children: true })
      throw new DOMException('StudioRenderer 생성이 취소되었습니다.', 'AbortError')
    }
    const renderer = new StudioRenderer(app, show)
    host.appendChild(app.canvas)
    renderer.buildScene()
    app.ticker.add(renderer.onTick)
    return renderer
  }

  draw(view: BroadcastView, slowmo: boolean): void {
    if (this.destroyed) return
    this.drawCameraFans(view)
    this.drawEquipment(view)
    this.drawActors(view)
    this.collectBubbles(view)
    this.applySlowmo(slowmo)
  }

  /**
   * 캔버스 논리 좌표(1280×720, 80px/m)의 한 점 (px, py)에 있는 출연자 id. 없으면 null.
   * CSS로 캔버스를 줄여 보여 준다면 클릭 좌표를 호출 쪽에서 논리 좌표로 환산해 넘긴다.
   */
  actorAt(px: number, py: number): string | null {
    let bestId: string | null = null
    let bestDistance = Infinity
    const reach = CAPSULE.radius * PIXELS_PER_METER + ACTOR_HIT_PADDING_PX
    for (const actor of this.lastActors) {
      if (actor.walkedOut) continue
      const [a, b] = capsuleEndpoints(actor.x, actor.y, actor.angle)
      const distance = distanceToSegment({ x: px, y: py }, a, b)
      if (distance <= reach && distance < bestDistance) {
        bestId = actor.id
        bestDistance = distance
      }
    }
    return bestId
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.app.ticker.remove(this.onTick)
    this.world.filters = null
    this.slowmoFilter.destroy()
    this.app.destroy({ removeView: true }, { children: true })
    this.actorSprites.clear()
    this.equipmentShapes.clear()
    this.bubbles = []
  }

  private readonly onTick = (): void => {
    this.elapsedSeconds += this.app.ticker.elapsedMS / 1000
    this.updateBubbles()
  }

  private buildScene(): void {
    this.slowmoFilter.saturate(SLOWMO_SATURATION, false)
    this.world.addChild(this.buildBackground(), this.fans, this.equipmentLayer, this.actorLayer)
    this.buildVignette()
    this.app.stage.addChild(this.world, this.bubbleLayer, this.vignette)
  }

  private buildBackground(): Graphics {
    const { audienceZone, exitX, homeSpots, benchSpot } = this.show
    const floorY = toScreen(0, 0).y
    const background = new Graphics()

    const audienceLeft = audienceZone.minX * PIXELS_PER_METER
    const audienceWidth = (audienceZone.maxX - audienceZone.minX) * PIXELS_PER_METER
    background
      .rect(audienceLeft, 0, audienceWidth, CANVAS_HEIGHT)
      .fill({ color: COLORS.audienceZone, alpha: AUDIENCE_FILL_ALPHA })
      .rect(audienceLeft, 0, audienceWidth, CANVAS_HEIGHT)
      .stroke({
        color: COLORS.audienceZoneLine,
        width: ZONE_LINE_WIDTH,
        alpha: AUDIENCE_LINE_ALPHA,
      })

    const exitLeft = exitX * PIXELS_PER_METER
    const exitHeight = EXIT_HEIGHT_METERS * PIXELS_PER_METER
    background
      .rect(exitLeft, floorY - exitHeight, CANVAS_WIDTH - exitLeft, exitHeight)
      .fill({ color: COLORS.exit, alpha: EXIT_FILL_ALPHA })
      .stroke({ color: COLORS.exit, width: ZONE_LINE_WIDTH })

    background
      .rect(0, floorY, CANVAS_WIDTH, CANVAS_HEIGHT - floorY)
      .fill(COLORS.floor)
      .moveTo(0, floorY)
      .lineTo(CANVAS_WIDTH, floorY)
      .stroke({ color: COLORS.floorLine, width: FLOOR_LINE_WIDTH })

    for (const spot of homeSpots) this.drawSpotMark(background, spot.x, floorY, COLORS.homeSpot)
    this.drawSpotMark(background, benchSpot.x, floorY, COLORS.benchSpot)
    return background
  }

  private drawSpotMark(target: Graphics, xMeters: number, floorY: number, color: number): void {
    const x = xMeters * PIXELS_PER_METER
    target
      .moveTo(x - SPOT_HALF_WIDTH, floorY - SPOT_LIFT)
      .lineTo(x + SPOT_HALF_WIDTH, floorY - SPOT_LIFT)
      .stroke({ color, width: SPOT_LINE_WIDTH })
  }

  private buildVignette(): void {
    for (let layer = 0; layer < VIGNETTE_LAYERS; layer++) {
      const inset = layer * VIGNETTE_LAYER_THICKNESS
      const alpha = VIGNETTE_MAX_ALPHA * (1 - layer / VIGNETTE_LAYERS)
      this.vignette
        .rect(
          inset + VIGNETTE_LAYER_THICKNESS / 2,
          inset + VIGNETTE_LAYER_THICKNESS / 2,
          CANVAS_WIDTH - inset * 2 - VIGNETTE_LAYER_THICKNESS,
          CANVAS_HEIGHT - inset * 2 - VIGNETTE_LAYER_THICKNESS,
        )
        .stroke({ color: COLORS.vignette, width: VIGNETTE_LAYER_THICKNESS, alpha })
    }
    this.vignette.visible = false
  }

  /** 상태가 바뀔 때만 필터와 비네트를 바꾼다. */
  private applySlowmo(slowmo: boolean): void {
    if (slowmo === this.slowmoActive) return
    this.slowmoActive = slowmo
    this.vignette.visible = slowmo
    this.world.filters = slowmo ? [this.slowmoFilter] : null
  }

  private drawCameraFans(view: BroadcastView): void {
    this.fans.clear()
    for (const camera of this.show.cameras) {
      const angleDegrees = view.cameraAngles[camera.id] ?? camera.defaultAngle
      this.drawFan(camera, angleDegrees, camera.id === view.onAirCameraId)
    }
  }

  private drawFan(camera: CameraDef, angleDegrees: number, onAir: boolean): void {
    const points = cameraFanPoints(
      camera.position,
      angleDegrees,
      camera.fovDegrees,
      camera.range,
      FAN_ARC_STEPS,
    )
    this.fans.poly(points).fill({
      color: onAir ? COLORS.cameraOnAirFan : COLORS.cameraFan,
      alpha: onAir ? FAN_ON_AIR_ALPHA : FAN_ALPHA,
    })
    if (onAir) {
      this.fans
        .poly(points)
        .stroke({ color: COLORS.cameraOnAirStroke, width: FAN_ON_AIR_LINE_WIDTH })
    }
    this.fans
      .circle(points[0], points[1], CAMERA_DOT_RADIUS)
      .fill(onAir ? COLORS.cameraOnAirStroke : COLORS.cameraBody)
  }

  private drawEquipment(view: BroadcastView): void {
    for (const item of view.equipment) {
      let shape = this.equipmentShapes.get(item.id)
      if (shape === undefined) {
        shape = new Graphics()
        this.equipmentShapes.set(item.id, shape)
        this.equipmentLayer.addChild(shape)
      }
      const isWall = item.kind === 'setWall'
      const half = isWall ? SET_WALL_HALF_EXTENTS : LIGHT_HALF_EXTENTS
      const width = half.hx * 2 * PIXELS_PER_METER
      const height = half.hy * 2 * PIXELS_PER_METER
      const baseColor = isWall ? COLORS.setWall : COLORS.light
      shape
        .clear()
        .rect(-width / 2, -height / 2, width, height)
        .fill(item.released ? COLORS.equipmentReleased : baseColor)
      const position = toScreen(item.x, item.y)
      shape.position.set(position.x, position.y)
      shape.rotation = -item.angle
    }
  }

  private drawActors(view: BroadcastView): void {
    this.lastActors = view.actors
    for (const actor of view.actors) {
      const sprite = this.actorSprites.get(actor.id) ?? this.createActorSprite(actor)
      this.drawActor(sprite, actor)
    }
  }

  private createActorSprite(actor: ActorView): ActorSprite {
    const root = new Container()
    const body = new Graphics()
    const symbol = new Text({
      text: '',
      style: {
        fill: COLORS.nameText,
        fontSize: SYMBOL_FONT_SIZE,
        fontWeight: 'bold',
        fontFamily: FONT_FAMILY,
      },
    })
    symbol.anchor.set(0.5, 1)
    const label = new Text({
      text: actor.name,
      style: { fill: COLORS.nameText, fontSize: NAME_FONT_SIZE, fontFamily: FONT_FAMILY },
    })
    label.anchor.set(0.5, 0)
    root.addChild(body)
    this.actorLayer.addChild(root, symbol, label)
    const sprite: ActorSprite = { root, body, symbol, label, drawnKey: null }
    this.actorSprites.set(actor.id, sprite)
    return sprite
  }

  /** Plan 2에서 스프라이트로 바뀌는 지점. actor 한 명을 그리는 일은 이 함수가 전부 맡는다. */
  private drawActor(sprite: ActorSprite, actor: ActorView): void {
    const visible = !actor.departed
    sprite.root.visible = visible
    sprite.symbol.visible = visible
    sprite.label.visible = visible
    if (!visible) return

    const drawnKey = `${actor.pose}:${actor.onAir}`
    if (sprite.drawnKey !== drawnKey) {
      sprite.drawnKey = drawnKey
      const width = CAPSULE.radius * 2 * PIXELS_PER_METER
      const height = (CAPSULE.halfHeight + CAPSULE.radius) * 2 * PIXELS_PER_METER
      sprite.body
        .clear()
        .roundRect(-width / 2, -height / 2, width, height, width / 2)
        .fill(POSE_COLORS[actor.pose])
        .stroke(
          actor.onAir
            ? { color: COLORS.cameraOnAirStroke, width: ACTOR_ON_AIR_OUTLINE_WIDTH }
            : {
                color: COLORS.actorOutline,
                width: ACTOR_OUTLINE_WIDTH,
                alpha: ACTOR_OUTLINE_ALPHA,
              },
        )
      sprite.symbol.text = POSE_SYMBOLS[actor.pose]
    }
    const center = toScreen(actor.x, actor.y)
    sprite.root.position.set(center.x, center.y)
    sprite.root.rotation = -actor.angle
    sprite.root.alpha = actor.walkedOut ? WALKED_OUT_ALPHA : 1
    // 글자는 몸과 함께 돌지 않고, 캡슐이 화면에서 위아래로 차지하는 폭만큼 떨어진 곳에 둔다.
    const extent = capsuleVerticalExtent(actor.angle)
    sprite.symbol.position.set(center.x, center.y - extent - TEXT_GAP)
    if (sprite.label.text !== actor.name) sprite.label.text = actor.name
    sprite.label.position.set(center.x, center.y + extent + TEXT_GAP)
  }

  private collectBubbles(view: BroadcastView): void {
    const newestIndex = view.log.length === 0 ? -1 : view.log[view.log.length - 1].index
    if (this.lastLogIndex === null) {
      // 처음 받은 로그는 이미 지난 일이므로 말풍선으로 띄우지 않는다.
      this.lastLogIndex = newestIndex
      return
    }
    const previousIndex = this.lastLogIndex
    const fresh = view.log.slice(-MAX_BUBBLES).filter((line) => line.index > previousIndex)
    this.lastLogIndex = newestIndex
    if (fresh.length === 0) return
    for (const line of fresh) this.bubbles.push(this.createBubble(line))
    while (this.bubbles.length > MAX_BUBBLES) this.bubbles.shift()?.root.destroy({ children: true })
    this.layoutBubbles()
  }

  private createBubble(line: LogLine): Bubble {
    const text = new Text({
      text: line.text,
      style: {
        fill: COLORS.bubbleText,
        fontSize: BUBBLE_FONT_SIZE,
        fontFamily: FONT_FAMILY,
        wordWrap: true,
        wordWrapWidth: BUBBLE_WRAP_WIDTH,
      },
    })
    text.anchor.set(0.5)
    const width = text.width + BUBBLE_PADDING_X * 2
    const height = text.height + BUBBLE_PADDING_Y * 2
    const background = new Graphics()
      .roundRect(-width / 2, -height / 2, width, height, BUBBLE_RADIUS)
      .fill({ color: COLORS.bubbleFill, alpha: BUBBLE_ALPHA })
    const root = new Container()
    root.addChild(background, text)
    this.bubbleLayer.addChild(root)

    const anchor = toScreen(line.x, line.y)
    const halfWidth = width / 2 + SCREEN_MARGIN
    const halfHeight = height / 2 + SCREEN_MARGIN
    return {
      root,
      width,
      height,
      anchorX: Math.min(Math.max(anchor.x, halfWidth), CANVAS_WIDTH - halfWidth),
      anchorY: Math.min(
        Math.max(anchor.y - BUBBLE_VERTICAL_OFFSET, halfHeight),
        CANVAS_HEIGHT - halfHeight,
      ),
      expiresAt: this.elapsedSeconds + BUBBLE_SECONDS,
    }
  }

  /**
   * 오래된 말풍선부터 제자리를 잡고, 나중 것은 겹치면 위로, 위가 막히면 아래로 비켜 간다.
   * 모두 이벤트 위치(anchor) 기준으로 다시 계산하므로 매번 같은 결과가 나온다.
   */
  private layoutBubbles(): void {
    const placed: Bubble[] = []
    for (const bubble of this.bubbles) {
      const step = bubble.height + BUBBLE_STACK_GAP
      const minY = bubble.height / 2 + SCREEN_MARGIN
      const maxY = CANVAS_HEIGHT - minY
      let y = bubble.anchorY
      for (let k = 0; k <= MAX_BUBBLES * 2; k++) {
        // k=0: 제자리, 이후 위(-), 아래(+)를 번갈아 시도
        const offset = k === 0 ? 0 : (k % 2 === 1 ? -1 : 1) * Math.ceil(k / 2) * step
        const candidate = bubble.anchorY + offset
        if (candidate < minY || candidate > maxY) continue
        if (!placed.some((other) => overlaps(bubble, bubble.anchorX, candidate, other))) {
          y = candidate
          break
        }
      }
      bubble.root.position.set(bubble.anchorX, y)
      placed.push(bubble)
    }
  }

  private updateBubbles(): void {
    const alive: Bubble[] = []
    for (const bubble of this.bubbles) {
      const remaining = bubble.expiresAt - this.elapsedSeconds
      if (remaining <= 0) {
        bubble.root.destroy({ children: true })
        continue
      }
      bubble.root.alpha = Math.min(1, remaining / BUBBLE_FADE_SECONDS)
      alive.push(bubble)
    }
    this.bubbles = alive
  }
}

/** bubble을 (x, y)에 두었을 때 이미 놓인 other(root 위치 기준)와 사각형이 겹치는지. */
function overlaps(bubble: Bubble, x: number, y: number, other: Bubble): boolean {
  return (
    Math.abs(x - other.root.x) < (bubble.width + other.width) / 2 + BUBBLE_STACK_GAP &&
    Math.abs(y - other.root.y) < (bubble.height + other.height) / 2 + BUBBLE_STACK_GAP
  )
}
