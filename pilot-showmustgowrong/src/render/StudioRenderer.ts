import {
  Application,
  ColorMatrixFilter,
  Container,
  Graphics,
  Text,
} from "pixi.js";
import {
  CAPSULE,
  LIGHT_HALF_EXTENTS,
  SET_WALL_HALF_EXTENTS,
  STUDIO_HEIGHT,
  STUDIO_WIDTH,
} from "@/content/balance";
import { LINEUP } from "@/content/lineup";
import type { CameraDef, EquipmentDef, ShowDef } from "@/content/types";
import type { ActorView, BroadcastView, LogLine } from "@/sim/engine";
import { COLORS, POSE_COLORS, POSE_SYMBOLS } from "./colors";

/** 1m당 픽셀 수. 16m × 9m가 1280×720이 된다. */
const PIXELS_PER_METER = 80;
const CANVAS_WIDTH = STUDIO_WIDTH * PIXELS_PER_METER;
const CANVAS_HEIGHT = STUDIO_HEIGHT * PIXELS_PER_METER;

const BUBBLE_SECONDS = 1.5;
const BUBBLE_FADE_SECONDS = 0.3;
const MAX_BUBBLES = 3;
const BUBBLE_VERTICAL_OFFSET = 56;
const BUBBLE_STACK_GAP = 34;
const ACTOR_HIT_PADDING_PX = 10;
const FAN_ARC_STEPS = 16;
const SLOWMO_SATURATION = -0.6;
const VIGNETTE_LAYERS = 10;
const VIGNETTE_LAYER_THICKNESS = 14;

interface Point {
  x: number;
  y: number;
}

interface ActorSprite {
  root: Container;
  body: Graphics;
  symbol: Text;
  label: Text;
  /** 마지막으로 그린 pose와 송출 여부. 바뀔 때만 도형을 다시 그린다. */
  drawnKey: string | null;
}

interface Bubble {
  key: string;
  root: Container;
  expiresAt: number;
}

/** 물리 좌표(m, 위가 +y)를 화면 좌표(px, 아래가 +y)로 바꾼다. */
function toScreen(x: number, y: number): Point {
  return { x: x * PIXELS_PER_METER, y: CANVAS_HEIGHT - y * PIXELS_PER_METER };
}

function logKey(line: LogLine): string {
  return `${line.step}:${line.eventId ?? "none"}:${line.text}`;
}

/**
 * 스튜디오를 도형으로 그린다. 물리 각도는 라디안·반시계(+y 위)이고
 * 카메라 각도는 도 단위·반시계다. 화면은 y가 아래로 늘어나므로 두 각도 모두 부호를 뒤집어 쓴다.
 */
export class StudioRenderer {
  private readonly app: Application;
  private readonly show: ShowDef;
  private readonly world = new Container();
  private readonly fans = new Graphics();
  private readonly equipmentLayer = new Container();
  private readonly actorLayer = new Container();
  private readonly bubbleLayer = new Container();
  private readonly vignette = new Graphics();
  private readonly slowmoFilter = new ColorMatrixFilter();
  private readonly actorSprites = new Map<string, ActorSprite>();
  private readonly equipmentShapes = new Map<string, Graphics>();
  private readonly equipmentDefs = new Map<string, EquipmentDef>();
  private readonly seenLogKeys = new Set<string>();
  private bubbles: Bubble[] = [];
  private elapsedSeconds = 0;
  private logPrimed = false;
  private lastActors: ActorView[] = [];
  private destroyed = false;

  private constructor(app: Application, show: ShowDef) {
    this.app = app;
    this.show = show;
    for (const def of LINEUP.equipment) this.equipmentDefs.set(def.id, def);
  }

  static async create(
    host: HTMLElement,
    show: ShowDef,
  ): Promise<StudioRenderer> {
    const app = new Application();
    await app.init({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      background: COLORS.background,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    const renderer = new StudioRenderer(app, show);
    host.appendChild(app.canvas);
    renderer.buildScene();
    app.ticker.add(renderer.onTick);
    return renderer;
  }

  draw(view: BroadcastView, slowmo: boolean): void {
    if (this.destroyed) return;
    this.drawCameraFans(view);
    this.drawEquipment(view);
    this.drawActors(view);
    this.collectBubbles(view);
    this.applySlowmo(slowmo);
  }

  /** 캔버스 논리 좌표(1280×720)의 한 점에 있는 출연자 id. 없으면 null. */
  actorAt(px: number, py: number): string | null {
    let bestId: string | null = null;
    let bestDistance = Infinity;
    const reach = CAPSULE.radius * PIXELS_PER_METER + ACTOR_HIT_PADDING_PX;
    for (const actor of this.lastActors) {
      if (actor.walkedOut) continue;
      const [a, b] = this.capsuleEndpoints(actor);
      const distance = distanceToSegment({ x: px, y: py }, a, b);
      if (distance <= reach && distance < bestDistance) {
        bestId = actor.id;
        bestDistance = distance;
      }
    }
    return bestId;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.remove(this.onTick);
    this.app.destroy({ removeView: true }, { children: true });
    this.actorSprites.clear();
    this.equipmentShapes.clear();
    this.bubbles = [];
  }

  private readonly onTick = (): void => {
    this.elapsedSeconds += this.app.ticker.elapsedMS / 1000;
    this.updateBubbles();
  };

  private buildScene(): void {
    this.world.addChild(
      this.buildBackground(),
      this.fans,
      this.equipmentLayer,
      this.actorLayer,
    );
    this.buildVignette();
    this.world.filters = [this.slowmoFilter];
    this.app.stage.addChild(this.world, this.bubbleLayer, this.vignette);
  }

  private buildBackground(): Graphics {
    const { audienceZone, exitX, homeSpots, benchSpot } = this.show;
    const floorY = toScreen(0, 0).y;
    const background = new Graphics();

    const audienceLeft = audienceZone.minX * PIXELS_PER_METER;
    const audienceWidth =
      (audienceZone.maxX - audienceZone.minX) * PIXELS_PER_METER;
    background
      .rect(audienceLeft, 0, audienceWidth, CANVAS_HEIGHT)
      .fill({ color: COLORS.audienceZone, alpha: 0.5 })
      .rect(audienceLeft, 0, audienceWidth, CANVAS_HEIGHT)
      .stroke({ color: COLORS.audienceZoneLine, width: 2, alpha: 0.6 });

    const exitLeft = exitX * PIXELS_PER_METER;
    background
      .rect(
        exitLeft,
        floorY - 2.2 * PIXELS_PER_METER,
        CANVAS_WIDTH - exitLeft,
        2.2 * PIXELS_PER_METER,
      )
      .fill({ color: COLORS.exit, alpha: 0.35 })
      .stroke({ color: COLORS.exit, width: 2 });

    background
      .rect(0, floorY, CANVAS_WIDTH, CANVAS_HEIGHT - floorY)
      .fill(COLORS.floor)
      .moveTo(0, floorY)
      .lineTo(CANVAS_WIDTH, floorY)
      .stroke({ color: COLORS.floorLine, width: 3 });

    for (const spot of homeSpots) {
      const x = spot.x * PIXELS_PER_METER;
      background.moveTo(x - 24, floorY - 3).lineTo(x + 24, floorY - 3);
      background.stroke({ color: COLORS.homeSpot, width: 4 });
    }
    const benchX = benchSpot.x * PIXELS_PER_METER;
    background.moveTo(benchX - 24, floorY - 3).lineTo(benchX + 24, floorY - 3);
    background.stroke({ color: COLORS.benchSpot, width: 4 });
    return background;
  }

  private buildVignette(): void {
    for (let layer = 0; layer < VIGNETTE_LAYERS; layer++) {
      const inset = layer * VIGNETTE_LAYER_THICKNESS;
      const alpha = 0.3 * (1 - layer / VIGNETTE_LAYERS);
      this.vignette
        .rect(
          inset + VIGNETTE_LAYER_THICKNESS / 2,
          inset + VIGNETTE_LAYER_THICKNESS / 2,
          CANVAS_WIDTH - inset * 2 - VIGNETTE_LAYER_THICKNESS,
          CANVAS_HEIGHT - inset * 2 - VIGNETTE_LAYER_THICKNESS,
        )
        .stroke({
          color: COLORS.vignette,
          width: VIGNETTE_LAYER_THICKNESS,
          alpha,
        });
    }
    this.vignette.visible = false;
  }

  private applySlowmo(slowmo: boolean): void {
    this.vignette.visible = slowmo;
    this.slowmoFilter.reset();
    if (slowmo) this.slowmoFilter.saturate(SLOWMO_SATURATION, false);
  }

  private drawCameraFans(view: BroadcastView): void {
    this.fans.clear();
    for (const camera of this.show.cameras) {
      const angleDegrees = view.cameraAngles[camera.id] ?? camera.defaultAngle;
      const onAir = camera.id === view.onAirCameraId;
      this.drawFan(camera, angleDegrees, onAir);
    }
  }

  private drawFan(
    camera: CameraDef,
    angleDegrees: number,
    onAir: boolean,
  ): void {
    const origin = toScreen(camera.position.x, camera.position.y);
    const range = camera.range * PIXELS_PER_METER;
    const center = (angleDegrees * Math.PI) / 180;
    const half = (camera.fovDegrees * Math.PI) / 360;
    const points: number[] = [origin.x, origin.y];
    for (let step = 0; step <= FAN_ARC_STEPS; step++) {
      const angle = center - half + (2 * half * step) / FAN_ARC_STEPS;
      // 물리 각도(반시계, +y 위)를 화면 좌표로: y 성분의 부호를 뒤집는다.
      points.push(
        origin.x + Math.cos(angle) * range,
        origin.y - Math.sin(angle) * range,
      );
    }
    this.fans
      .poly(points)
      .fill({
        color: onAir ? COLORS.cameraOnAirFan : COLORS.cameraFan,
        alpha: onAir ? 0.2 : 0.12,
      });
    if (onAir)
      this.fans
        .poly(points)
        .stroke({ color: COLORS.cameraOnAirStroke, width: 3 });
    this.fans
      .circle(origin.x, origin.y, 8)
      .fill(onAir ? COLORS.cameraOnAirStroke : COLORS.cameraBody);
  }

  private drawEquipment(view: BroadcastView): void {
    for (const item of view.equipment) {
      let shape = this.equipmentShapes.get(item.id);
      if (shape === undefined) {
        shape = new Graphics();
        this.equipmentShapes.set(item.id, shape);
        this.equipmentLayer.addChild(shape);
      }
      const kind = this.equipmentDefs.get(item.id)?.kind ?? "hangingLight";
      const half =
        kind === "setWall" ? SET_WALL_HALF_EXTENTS : LIGHT_HALF_EXTENTS;
      const width = half.hx * 2 * PIXELS_PER_METER;
      const height = half.hy * 2 * PIXELS_PER_METER;
      const baseColor = kind === "setWall" ? COLORS.setWall : COLORS.light;
      shape
        .clear()
        .rect(-width / 2, -height / 2, width, height)
        .fill(item.released ? COLORS.equipmentReleased : baseColor);
      const position = toScreen(item.x, item.y);
      shape.position.set(position.x, position.y);
      shape.rotation = -item.angle;
    }
  }

  private drawActors(view: BroadcastView): void {
    this.lastActors = view.actors;
    for (const actor of view.actors) {
      const sprite =
        this.actorSprites.get(actor.id) ?? this.createActorSprite(actor);
      this.drawActor(sprite, actor);
    }
  }

  private createActorSprite(actor: ActorView): ActorSprite {
    const root = new Container();
    const body = new Graphics();
    const symbol = new Text({
      text: "",
      style: {
        fill: COLORS.nameText,
        fontSize: 28,
        fontWeight: "bold",
        fontFamily: "sans-serif",
      },
    });
    symbol.anchor.set(0.5, 1);
    const label = new Text({
      text: actor.name,
      style: { fill: COLORS.nameText, fontSize: 14, fontFamily: "sans-serif" },
    });
    label.anchor.set(0.5, 0);
    this.actorLayer.addChild(root);
    root.addChild(body);
    this.actorLayer.addChild(symbol, label);
    const sprite: ActorSprite = { root, body, symbol, label, drawnKey: null };
    this.actorSprites.set(actor.id, sprite);
    return sprite;
  }

  /** Plan 2에서 스프라이트로 바뀌는 지점. actor 한 명을 그리는 일은 이 함수가 전부 맡는다. */
  private drawActor(sprite: ActorSprite, actor: ActorView): void {
    const visible = !(actor.walkedOut && actor.x >= this.show.exitX - 0.5);
    sprite.root.visible = visible;
    sprite.symbol.visible = visible;
    sprite.label.visible = visible;
    if (!visible) return;

    const drawnKey = `${actor.pose}:${actor.onAir}`;
    if (sprite.drawnKey !== drawnKey) {
      sprite.drawnKey = drawnKey;
      const width = CAPSULE.radius * 2 * PIXELS_PER_METER;
      const height =
        (CAPSULE.halfHeight + CAPSULE.radius) * 2 * PIXELS_PER_METER;
      sprite.body
        .clear()
        .roundRect(-width / 2, -height / 2, width, height, width / 2)
        .fill(POSE_COLORS[actor.pose])
        .stroke(
          actor.onAir
            ? { color: COLORS.cameraOnAirStroke, width: 4 }
            : { color: 0x000000, width: 2, alpha: 0.5 },
        );
      sprite.symbol.text = POSE_SYMBOLS[actor.pose];
    }
    const center = toScreen(actor.x, actor.y);
    const alpha = actor.walkedOut ? 0.5 : 1;
    sprite.root.position.set(center.x, center.y);
    sprite.root.rotation = -actor.angle;
    sprite.root.alpha = alpha;
    const halfHeightPx =
      (CAPSULE.halfHeight + CAPSULE.radius) * PIXELS_PER_METER;
    sprite.symbol.position.set(center.x, center.y - halfHeightPx - 4);
    if (sprite.label.text !== actor.name) sprite.label.text = actor.name;
    sprite.label.position.set(center.x, center.y + halfHeightPx + 4);
  }

  private capsuleEndpoints(actor: ActorView): [Point, Point] {
    const center = toScreen(actor.x, actor.y);
    const half = CAPSULE.halfHeight * PIXELS_PER_METER;
    // 캡슐의 위쪽 축 (0, -half)을 화면 회전(-angle)만큼 돌린다.
    const rotation = -actor.angle;
    const dx = -Math.sin(rotation) * half;
    const dy = Math.cos(rotation) * -half;
    return [
      { x: center.x + dx, y: center.y + dy },
      { x: center.x - dx, y: center.y - dy },
    ];
  }

  private collectBubbles(view: BroadcastView): void {
    if (!this.logPrimed) {
      // 처음 받은 로그는 이미 지난 일이므로 말풍선으로 띄우지 않는다.
      for (const line of view.log) this.seenLogKeys.add(logKey(line));
      this.logPrimed = true;
      return;
    }
    const latest = view.log.slice(-MAX_BUBBLES);
    for (const line of latest) {
      const key = logKey(line);
      if (this.seenLogKeys.has(key)) continue;
      this.seenLogKeys.add(key);
      this.bubbles.push(this.createBubble(line, key));
    }
    // 이미 지난 줄의 key는 로그가 50줄로 잘릴 때 함께 정리한다.
    if (this.seenLogKeys.size > view.log.length * 2 + 10) {
      this.seenLogKeys.clear();
      for (const line of view.log) this.seenLogKeys.add(logKey(line));
    }
    while (this.bubbles.length > MAX_BUBBLES) {
      const oldest = this.bubbles.shift();
      oldest?.root.destroy({ children: true });
    }
    this.layoutBubbles();
  }

  private createBubble(line: LogLine, key: string): Bubble {
    const root = new Container();
    const text = new Text({
      text: line.text,
      style: {
        fill: COLORS.bubbleText,
        fontSize: 15,
        fontFamily: "sans-serif",
        wordWrap: true,
        wordWrapWidth: 260,
      },
    });
    text.anchor.set(0.5);
    const paddingX = 10;
    const paddingY = 6;
    const background = new Graphics()
      .roundRect(
        -text.width / 2 - paddingX,
        -text.height / 2 - paddingY,
        text.width + paddingX * 2,
        text.height + paddingY * 2,
        10,
      )
      .fill({ color: COLORS.bubbleFill, alpha: 0.95 });
    root.addChild(background, text);
    const anchor = toScreen(line.x, line.y);
    root.position.set(
      Math.min(
        Math.max(anchor.x, text.width / 2 + 16),
        CANVAS_WIDTH - text.width / 2 - 16,
      ),
      Math.max(anchor.y - BUBBLE_VERTICAL_OFFSET, text.height / 2 + 12),
    );
    this.bubbleLayer.addChild(root);
    return { key, root, expiresAt: this.elapsedSeconds + BUBBLE_SECONDS };
  }

  /** 겹치지 않도록 최신 말풍선일수록 위로 쌓는다. */
  private layoutBubbles(): void {
    const placed: Bubble[] = [];
    for (const bubble of this.bubbles) {
      for (const other of placed) {
        if (
          Math.abs(other.root.x - bubble.root.x) < 300 &&
          Math.abs(other.root.y - bubble.root.y) < BUBBLE_STACK_GAP
        ) {
          bubble.root.y = other.root.y - BUBBLE_STACK_GAP;
        }
      }
      bubble.root.y = Math.max(bubble.root.y, 20);
      placed.push(bubble);
    }
  }

  private updateBubbles(): void {
    const alive: Bubble[] = [];
    for (const bubble of this.bubbles) {
      const remaining = bubble.expiresAt - this.elapsedSeconds;
      if (remaining <= 0) {
        bubble.root.destroy({ children: true });
        continue;
      }
      bubble.root.alpha = Math.min(1, remaining / BUBBLE_FADE_SECONDS);
      alive.push(bubble);
    }
    this.bubbles = alive;
  }
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSquared,
          ),
        );
  return Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t));
}
