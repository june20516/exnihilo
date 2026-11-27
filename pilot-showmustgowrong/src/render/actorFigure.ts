import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { CAPSULE } from '@/content/balance'
import type { Pose } from '@/content/types'
import type { ActorView } from '@/sim/engineTypes'
import type { Vec3 } from '@/sim/vec'
import { COLORS } from './colors'
import { EmotionBadge } from './emotionBadge'
import { depthKey, screenTilt, type Point } from './geometry'
import type { BillboardHitShape } from './hitTest'
import { performerArtUrl } from './performerArt'

/** 불러 둔 출연자 그림. 키는 performerArtUrl의 주소다 */
export type ArtTextures = Readonly<Partial<Record<string, Texture>>>

/** 머리 위 클로즈업 표시. following: 대상을 따라가는 중, held: 대상이지만 지시·놀람으로 다른 곳을 봄 */
export type TrackMark = 'following' | 'held'

/** 캡슐 중심에서 발끝까지(m) */
const FOOT_REACH_METERS = CAPSULE.halfHeight + CAPSULE.radius
/** 캡슐이 서 있을 때 발끝~머리끝 높이(m) */
const STANDING_HEIGHT_METERS = 2 * FOOT_REACH_METERS
/**
 * 키 기준 그림(렉스·프리야·오카포 idle)의 원본 높이(px). 이 그림을 캡슐 키에 맞추고 모든 그림에 같은
 * 배율을 쓴다. 그래서 모(268px)는 조금 크고 준(205px)은 작게, 그림끼리의 키 차이가 그대로 남는다.
 */
const REFERENCE_ART_HEIGHT_PX = 256
/**
 * 누운 그림(날아감·쓰러짐)의 최대 회전. 바닥의 x축·z축은 화면에서 30도 기울어 보이므로, 바닥에 누운
 * 몸은 늘 이 안에 든다. 이보다 크게 돌려야 하는 것은 선 채로 날거나 넘어진 몸이라 그림을 세우지 않는다.
 */
const LYING_MAX_ROTATION = Math.PI / 6

/** 이탈해 걸어 나가는 출연자와 초점 밖 출연자의 불투명도 */
export const WALKED_OUT_ALPHA = 0.45
export const UNFOCUSED_ALPHA = 0.45

const HIT_PADDING_PX = 6
const FONT_FAMILY = 'sans-serif'
const NAME_FONT_SIZE = 11
const NAME_GAP = 2
const NAME_PADDING_X = 5
const NAME_PADDING_Y = 1
const NAME_BORDER_WIDTH = 1.5
const NAME_BACK_ALPHA = 0.8
/** 송출 중인 출연자 이름 앞의 빨간 점 */
const ON_AIR_DOT_RADIUS = 3
const ON_AIR_DOT_GAP = 4
const BADGE_GAP = 4
const EMOTE_FONT_SIZE = 16
/** 이모트를 배지 원 오른쪽 위에 붙일 때 원 반지름에 곱하는 비율 */
const EMOTE_OFFSET_RATIO = 0.9
const EMOTE_MIN_OFFSET_PX = 10

// 발밑 클로즈업 점선 고리
/** 발밑 클로즈업 고리의 반지름(m). 그림자(캡슐 반지름)보다 조금 넓다 */
export const CLOSEUP_RING_RADIUS_METERS = CAPSULE.radius + 0.2
const CLOSEUP_DASHES = 14
const CLOSEUP_DASH_STEPS = 4
const CLOSEUP_LINE_WIDTH = 2.5
const CLOSEUP_HELD_LINE_WIDTH = 1.5
const CLOSEUP_HELD_ALPHA = 0.5

/** 그림 원본 1px을 화면 px로 바꾸는 배율. scale은 IsoTransform.scale(1m의 화면 px)이다 */
export function artDisplayScale(scale: number): number {
  return (STANDING_HEIGHT_METERS / REFERENCE_ART_HEIGHT_PX) * scale
}

/**
 * 그림을 거는 점. feet: 몸 위 방향을 따라 내려간 발끝(그림 아래 가운데), floor: 몸 중심 바로 아래 바닥
 * (그림 아래 가운데), center: 몸 중심(그림 가운데).
 */
export type ArtAnchor = 'feet' | 'floor' | 'center'

/** 그림을 화면에 놓는 방법 */
export interface ArtOrientation {
  /** Pixi rotation(시계 방향 +) */
  rotation: number
  /** 좌우를 뒤집는다 */
  mirrored: boolean
  anchor: ArtAnchor
}

/**
 * 그림의 화면 회전과 거는 점. tilt는 몸 위 방향의 화면 기울기(screenTilt)다.
 * 서 있는 그림은 지금 캡슐처럼 발끝에 걸고 tilt만큼 돌린다.
 * 날아감·쓰러짐 그림은 이미 머리가 오른쪽(tilt +90도)으로 누운 가로 그림이라 tilt를 그대로 쓰면 90도 더
 * 돌아간다. 그래서 머리 쪽(tilt의 부호)으로 좌우 방향만 정하고(왼쪽이면 뒤집음), 머리 방향이 tilt가 되도록
 * 돌리되 LYING_MAX_ROTATION까지만 돌린다. 바닥에 누운 몸은 바닥 선을 그대로 따르고, 선 채로 날거나 넘어진
 * 몸에서도 누운 그림이 세워지지 않아 포즈가 그대로 읽힌다. 쓰러짐은 바닥에, 날아감은 공중의 몸 중심에 건다.
 */
export function artOrientation(pose: Pose, tilt: number): ArtOrientation {
  if (pose !== 'flying' && pose !== 'fallen') {
    return { rotation: tilt, mirrored: false, anchor: 'feet' }
  }
  const anchor: ArtAnchor = pose === 'fallen' ? 'floor' : 'center'
  const mirrored = tilt < 0
  const rotation = mirrored ? tilt + Math.PI / 2 : tilt - Math.PI / 2
  const clamped = Math.min(LYING_MAX_ROTATION, Math.max(-LYING_MAX_ROTATION, rotation))
  // -0을 0으로 맞춘다(같은 자세가 같은 값이 되도록)
  return { rotation: clamped === 0 ? 0 : clamped, mirrored, anchor }
}

/**
 * 발밑 바닥의 클로즈업 대상 점선 고리. 따라가는 중이면 진하게, 지시·놀람으로 다른 곳을 보면 가늘고 흐리게.
 * rx, ry는 바닥 원의 화면 타원 반지름(px)이다.
 */
export function drawCloseupRing(
  floor: Graphics,
  center: Point,
  radii: { rx: number; ry: number },
  mark: TrackMark,
): void {
  const dashAngle = Math.PI / CLOSEUP_DASHES
  for (let dash = 0; dash < CLOSEUP_DASHES; dash++) {
    const start = dash * dashAngle * 2
    for (let step = 0; step <= CLOSEUP_DASH_STEPS; step++) {
      const angle = start + (dashAngle * step) / CLOSEUP_DASH_STEPS
      const x = center.x + Math.cos(angle) * radii.rx
      const y = center.y + Math.sin(angle) * radii.ry
      if (step === 0) floor.moveTo(x, y)
      else floor.lineTo(x, y)
    }
  }
  floor.stroke(
    mark === 'following'
      ? { color: COLORS.closeupRing, width: CLOSEUP_LINE_WIDTH }
      : { color: COLORS.closeupRing, width: CLOSEUP_HELD_LINE_WIDTH, alpha: CLOSEUP_HELD_ALPHA },
  )
}

/** 출연자 한 명의 그림을 놓을 때 렌더러가 넘기는 것 */
export interface FigureContext {
  project(point: Vec3): Point
  /** IsoTransform.scale */
  scale: number
  textures: ArtTextures
  /** 다른 출연자에게 초점이 있어 흐리게 그린다 */
  unfocused: boolean
}

/**
 * 스튜디오의 출연자 한 명: 포즈 그림, 이름표(몸 레이어), 머리 위 감정 배지와 버릇 이모트(표시 레이어).
 * body는 깊이 정렬되는 몸 레이어에, overhead는 몸 위 표시 레이어에 렌더러가 붙인다.
 */
export class ActorFigure {
  readonly body = new Container()
  readonly overhead = new Container()
  private readonly sprite = new Sprite()
  private readonly nameTag = new Container()
  private readonly nameBack = new Graphics()
  private readonly nameText = new Text({
    text: '',
    style: { fill: COLORS.nameText, fontSize: NAME_FONT_SIZE, fontFamily: FONT_FAMILY },
  })
  private readonly badge = new EmotionBadge()
  private readonly emote = new Text({
    text: '',
    style: { fontSize: EMOTE_FONT_SIZE, fontFamily: FONT_FAMILY },
  })
  private readonly color: string
  private drawnNameKey: string | null = null

  /** color는 출연자 색(#RRGGBB). 이름표 테두리에 쓴다 */
  constructor(color: string) {
    this.color = color
    this.nameText.anchor.set(0, 0.5)
    this.nameTag.addChild(this.nameBack, this.nameText)
    this.body.addChild(this.sprite, this.nameTag)
    this.emote.anchor.set(0.5)
    this.overhead.addChild(this.badge.root, this.emote)
  }

  /** view의 출연자를 그린다. 클릭할 수 있는 모양을 돌려주고, 숨었거나 걸어 나가는 중이면 null이다 */
  update(actor: ActorView, context: FigureContext): BillboardHitShape | null {
    const visible = !actor.departed
    this.body.visible = visible
    this.overhead.visible = visible && !actor.walkedOut
    if (!visible) return null

    const texture = context.textures[performerArtUrl(actor.id, actor.pose)]
    if (texture !== undefined && this.sprite.texture !== texture) this.sprite.texture = texture
    const orientation = artOrientation(actor.pose, screenTilt(actor.up))
    const pixelScale = artDisplayScale(context.scale)
    this.sprite.scale.set(orientation.mirrored ? -pixelScale : pixelScale, pixelScale)
    this.sprite.rotation = orientation.rotation
    const width = this.sprite.texture.width * pixelScale
    const height = this.sprite.texture.height * pixelScale

    // 그림의 화면 중심. 몸 중심에 걸면 그대로, 발끝·바닥에 걸면 거는 점에서 회전 방향으로 반 키 위다.
    const rotation = orientation.rotation
    let center: Point
    if (orientation.anchor === 'center') {
      this.sprite.anchor.set(0.5, 0.5)
      center = context.project(actor)
      this.sprite.position.set(0, 0)
    } else {
      this.sprite.anchor.set(0.5, 1)
      const hang = context.project(
        orientation.anchor === 'feet'
          ? {
              x: actor.x - actor.up.x * FOOT_REACH_METERS,
              y: actor.y - actor.up.y * FOOT_REACH_METERS,
              z: actor.z - actor.up.z * FOOT_REACH_METERS,
            }
          : { x: actor.x, y: 0, z: actor.z },
      )
      center = {
        x: hang.x + (Math.sin(rotation) * height) / 2,
        y: hang.y - (Math.cos(rotation) * height) / 2,
      }
      this.sprite.position.set(hang.x - center.x, hang.y - center.y)
    }
    // 돌아간 그림이 화면에서 위·아래로 차지하는 반 폭. 이름표와 배지가 그림에 붙는다.
    const extentY = (Math.abs(Math.cos(rotation)) * height + Math.abs(Math.sin(rotation)) * width) / 2

    const depth = depthKey(actor)
    this.body.position.set(center.x, center.y)
    this.body.zIndex = depth
    const dim = context.unfocused ? UNFOCUSED_ALPHA : 1
    this.body.alpha = (actor.walkedOut ? WALKED_OUT_ALPHA : 1) * dim
    this.drawNameTag(actor.name, actor.onAir)
    this.nameTag.position.set(0, extentY + NAME_GAP)

    this.overhead.alpha = dim
    this.drawOverhead(actor)
    this.overhead.position.set(center.x, center.y - extentY - BADGE_GAP - this.badge.bottomExtent)

    if (actor.walkedOut) return null
    return {
      id: actor.id,
      center,
      tilt: rotation,
      halfWidth: width / 2 + HIT_PADDING_PX,
      halfHeight: height / 2 + HIT_PADDING_PX,
      depth,
    }
  }

  /** 2단계 배지 고리를 실제 시간으로 깜박인다 */
  blink(realMs: number): void {
    this.badge.blink(realMs)
  }

  /** 출연자 색 테두리의 이름표. 송출 중이면 이름 앞에 빨간 점을 둔다. 바뀔 때만 다시 그린다 */
  private drawNameTag(name: string, onAir: boolean): void {
    const key = `${name}:${onAir}`
    if (key === this.drawnNameKey) return
    this.drawnNameKey = key
    this.nameText.text = name
    const dotSpace = onAir ? ON_AIR_DOT_RADIUS * 2 + ON_AIR_DOT_GAP : 0
    const width = this.nameText.width + dotSpace + NAME_PADDING_X * 2
    const height = this.nameText.height + NAME_PADDING_Y * 2
    const left = -width / 2
    this.nameBack
      .clear()
      .roundRect(left, 0, width, height, height / 2)
      .fill({ color: COLORS.nameTagBack, alpha: NAME_BACK_ALPHA })
      .stroke({ color: this.color, width: NAME_BORDER_WIDTH })
    if (onAir) {
      this.nameBack
        .circle(left + NAME_PADDING_X + ON_AIR_DOT_RADIUS, height / 2, ON_AIR_DOT_RADIUS)
        .fill(COLORS.cameraOnAirStroke)
    }
    this.nameText.position.set(left + NAME_PADDING_X + dotSpace, height / 2)
  }

  /** 대표 감정 배지(마음이 없으면 숨김)와, 버릇을 한 지 얼마 안 됐으면 배지 오른쪽 위의 이모트 */
  private drawOverhead(actor: ActorView): void {
    const mood = actor.mood
    this.badge.root.visible = mood !== null
    if (mood !== null) this.badge.update(mood)

    const habit = actor.habit
    this.emote.visible = habit !== null
    if (habit === null) return
    if (this.emote.text !== habit.emote) this.emote.text = habit.emote
    const offset = Math.max(EMOTE_MIN_OFFSET_PX, this.badge.radius * EMOTE_OFFSET_RATIO)
    this.emote.position.set(offset, -offset)
  }
}
