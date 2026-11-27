import { Container, Graphics, Text } from 'pixi.js'
import type { EmotionId } from '@/content/types'
import type { MoodView } from '@/sim/life'
import { COLORS } from './colors'

/** 감정 하나의 배지 색(#RRGGBB)과 아이콘(이모지) */
export interface EmotionStyle {
  color: string
  icon: string
}

/** 감정 색과 아이콘(spec 4.1). 색은 배지 고리에, 아이콘은 배지 가운데에 쓴다 */
export const EMOTION_STYLE: Record<EmotionId, EmotionStyle> = {
  irritation: { color: '#EF4444', icon: '😠' },
  excitement: { color: '#FACC15', icon: '😆' },
  anxiety: { color: '#A855F7', icon: '😨' },
  boredom: { color: '#64748B', icon: '😪' },
  attention: { color: '#EC4899', icon: '📷' },
  chatter: { color: '#38BDF8', icon: '💬' },
}

/** 표에 없는 감정(새로 더한 개인 감정 등)도 오류 없이 그리도록 쓰는 회색 물음표 */
const UNKNOWN_EMOTION_STYLE: EmotionStyle = { color: '#94A3B8', icon: '❔' }

export function emotionStyle(emotion: EmotionId): EmotionStyle {
  return Object.hasOwn(EMOTION_STYLE, emotion) ? EMOTION_STYLE[emotion] : UNKNOWN_EMOTION_STYLE
}

/** 대표 감정의 단계가 정하는 배지 모양 */
export interface BadgeLook {
  size: 'faint' | 'normal' | 'large'
  ring: 'none' | 'half' | 'full'
  showName: boolean
  blink: boolean
}

/** 0단계(또는 마음 없음)는 흐린 아이콘만, 1단계는 반 고리와 이름, 2단계는 크게·꽉 찬 고리·이름·깜박임 */
export function badgeLook(mood: MoodView | null): BadgeLook {
  if (mood === null || mood.stage === 0) {
    return { size: 'faint', ring: 'none', showName: false, blink: false }
  }
  if (mood.stage === 1) return { size: 'normal', ring: 'half', showName: true, blink: false }
  return { size: 'large', ring: 'full', showName: true, blink: true }
}

/** 깜박임 한 주기(실제 ms). 앞 절반만 보인다 */
const BLINK_PERIOD_MS = 500

/** 실제 시간 realMs(performance.now 기준)에 깜박이는 표시가 보이는지. 슬로모션과 관계없다 */
export function blinkVisible(realMs: number): boolean {
  const phase = ((realMs % BLINK_PERIOD_MS) + BLINK_PERIOD_MS) % BLINK_PERIOD_MS
  return phase < BLINK_PERIOD_MS / 2
}

// 배지 크기(캔버스 px)
const NORMAL_DIAMETER = 28
const LARGE_RATIO = 1.6
const ICON_TO_DIAMETER = 0.6
const FAINT_ICON_SIZE = 14
const FAINT_ALPHA = 0.5
const DISC_ALPHA = 0.85
const NORMAL_RING_WIDTH = 3
const LARGE_RING_WIDTH = 4
const NAME_FONT_SIZE = 11
const LARGE_NAME_FONT_SIZE = 13
const NAME_GAP = 2
const NAME_STROKE_WIDTH = 3
const FONT_FAMILY = 'sans-serif'

/**
 * 머리 위 감정 배지: 원 + 감정 아이콘 + 단계 고리 + 단계 이름. 원점은 원(0단계는 아이콘)의 가운데다.
 * 모양은 대표 감정과 단계가 바뀔 때만 다시 그리고, 깜박임은 blink(realMs)로 고리만 켜고 끈다.
 */
export class EmotionBadge {
  readonly root = new Container()
  private readonly disc = new Graphics()
  private readonly ring = new Graphics()
  private readonly icon = new Text({ text: '', style: { fontFamily: FONT_FAMILY } })
  private readonly stageName = new Text({
    text: '',
    style: {
      fill: COLORS.nameText,
      fontFamily: FONT_FAMILY,
      fontWeight: 'bold',
      stroke: { color: COLORS.badgeDisc, width: NAME_STROKE_WIDTH },
    },
  })
  private drawnKey: string | null = null
  private blinking = false
  private radiusPx = 0

  constructor() {
    this.icon.anchor.set(0.5)
    this.stageName.anchor.set(0.5, 0)
    this.root.addChild(this.disc, this.ring, this.icon, this.stageName)
  }

  /** 원(0단계는 아이콘)의 반지름(px). 이모트를 배지 오른쪽 위에 붙일 때 쓴다 */
  get radius(): number {
    return this.radiusPx
  }

  /** 원점에서 배지 아래 끝(단계 이름 포함)까지의 거리(px). 머리 위에 올릴 때 쓴다 */
  get bottomExtent(): number {
    return this.stageName.visible
      ? this.radiusPx + NAME_GAP + this.stageName.height
      : this.radiusPx
  }

  update(mood: MoodView): void {
    const key = `${mood.emotion}:${mood.stage}:${mood.stageName ?? ''}`
    if (key === this.drawnKey) return
    this.drawnKey = key
    const look = badgeLook(mood)
    const style = emotionStyle(mood.emotion)
    this.blinking = look.blink
    this.ring.visible = true
    this.icon.text = style.icon

    this.disc.clear()
    this.ring.clear()
    if (look.size === 'faint') {
      this.radiusPx = FAINT_ICON_SIZE / 2
      this.icon.style.fontSize = FAINT_ICON_SIZE
      this.root.alpha = FAINT_ALPHA
      this.stageName.visible = false
      return
    }

    const diameter = look.size === 'large' ? NORMAL_DIAMETER * LARGE_RATIO : NORMAL_DIAMETER
    const radius = diameter / 2
    this.radiusPx = radius
    this.root.alpha = 1
    this.icon.style.fontSize = Math.round(diameter * ICON_TO_DIAMETER)
    this.disc.circle(0, 0, radius).fill({ color: COLORS.badgeDisc, alpha: DISC_ALPHA })
    if (look.ring === 'half') {
      // 위에서 시계 방향으로 반 바퀴: 터짐까지 절반쯤 왔다는 뜻
      this.ring
        .arc(0, 0, radius, -Math.PI / 2, Math.PI / 2)
        .stroke({ color: style.color, width: NORMAL_RING_WIDTH })
    } else if (look.ring === 'full') {
      this.ring.circle(0, 0, radius).stroke({ color: COLORS.moodDanger, width: LARGE_RING_WIDTH })
    }

    this.stageName.visible = look.showName && mood.stageName !== null
    this.stageName.text = mood.stageName ?? ''
    this.stageName.style.fontSize = look.size === 'large' ? LARGE_NAME_FONT_SIZE : NAME_FONT_SIZE
    this.stageName.position.set(0, radius + NAME_GAP)
  }

  /** 2단계 고리를 실제 시간으로 깜박인다. 깜박이지 않는 단계에서는 아무것도 하지 않는다 */
  blink(realMs: number): void {
    if (this.blinking) this.ring.visible = blinkVisible(realMs)
  }
}
