import { useEffect, useRef, useState } from 'react'
import type { CameraDef, PerformerDef, ShowDef } from '@/content/types'
import { REFERENCE_ART_HEIGHT_PX } from '@/render/actorFigure'
import { COLORS } from '@/render/colors'
import { cameraFeed, type FeedItem, type FeedView } from '@/render/cameraFeed'
import { blinkVisible, badgeLook, emotionStyle } from '@/render/emotionBadge'
import { feedArtImage, isArtReady } from '@/render/feedArt'
import { layoutFeedLabels } from '@/render/feedLabels'

/** 피드 픽셀 상수 */
const HORIZON_RATIO = 0.35
const FLOOR_LINE_RATIO = 0.75
const BODY_HEIGHT_RATIO = 0.3
/** 그림이 없거나 아직 불러오는 중일 때 대신 그리는 사각형의 가로/세로 */
const PLACEHOLDER_ASPECT = 0.4
const NAME_FONT_RATIO = 0.05
const MIN_FONT_PX = 10
const HIGHLIGHT_WIDTH = 3
const OUTLINE_WIDTH = 1.5
const EQUIPMENT_SIZE_RATIO = 0.18
const AUDIENCE_DOTS = 40
const AUDIENCE_DOT_RADIUS_RATIO = 0.012
const AUDIENCE_SPREAD_RATIO = 0.2
/** 관객 점을 퍼뜨리는 황금각(라디안) */
const GOLDEN_ANGLE = 2.399963
/** 관객 점 무리의 중심이 지평선에서 내려오는 높이(캔버스 높이 비율) */
const AUDIENCE_DROP_RATIO = 0.1
/** 관객 점 무리의 세로 납작함(가로 퍼짐 대비) */
const AUDIENCE_FLATTEN = 0.4
/** 이름표와 몸 사이 간격(px) */
const LABEL_GAP_PX = 2
const FONT_FAMILY = 'sans-serif'
/** 이름표 줄 높이(글자 크기 대비) */
const LABEL_LINE_RATIO = 1.25
/** 이름표가 피드 가장자리에서 떨어지는 거리(px) */
const LABEL_EDGE_PADDING_PX = 2
/** 이름표 뒤 반투명 바탕 */
const LABEL_BACKGROUND = 'rgba(0, 0, 0, 0.55)'
const LABEL_BACKGROUND_PADDING_PX = 2

/** 이름표 바탕·테두리 */
const LABEL_BORDER_WIDTH = 1.5
/** 이름표 안 단계 아이콘 지름(이름표 높이 대비 빼는 px)과 글자와의 간격 */
const STAGE_ICON_INSET_PX = 2
const STAGE_ICON_GAP_PX = 2
const STAGE_ICON_FONT_RATIO = 0.7
const STAGE_RING_WIDTH = 1.5
/** 출연자 색을 모를 때(장비·관객석) 이름표 테두리 */
const NEUTRAL_BORDER = '#64748B'
/** 2단계 깜박임을 다시 그리는 간격(실제 ms). 깜박임 반주기(250ms)보다 짧아야 한다 */
const BLINK_REDRAW_MS = 100

/** 이름표 앞에 붙는 단계 아이콘. 0단계·마음 없음은 null이라 붙지 않는다 */
interface StageIcon {
  emoji: string
  ring: 'half' | 'full'
  ringColor: string
  /** 2단계: 실제 시간으로 깜박인다 */
  blink: boolean
}

/** 몸 위에 붙일 이름표. 다 그린 뒤 한꺼번에 겹치지 않게 놓는다. */
interface PendingLabel {
  text: string
  x: number
  top: number
  /** 테두리 색(출연자 색) */
  borderColor: string
  icon: StageIcon | null
}

/** 그릴 때마다 바뀌는 입력 */
interface DrawInput {
  items: FeedItem[]
  width: number
  height: number
  /** 실제 시간(performance.now). 깜박임에 쓴다 */
  realMs: number
  /** 그림이 늦게 불러와졌을 때 다시 그리게 하는 호출 */
  onArtLoad: () => void
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

/** 화면 픽셀 밀도. Retina처럼 2 이상이면 그만큼 큰 캔버스에 그려 흐리지 않게 한다. */
function pixelRatio(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
}

interface CameraFeedCanvasProps {
  view: FeedView
  camera: CameraDef
  audienceZone: ShowDef['audienceZone']
  /** 출연자 id → 정의. 이름표 테두리 색과 짧은 이름에 쓴다 */
  performers: ReadonlyMap<string, PerformerDef>
  /** 작은 미리보기처럼 본명이 들어갈 자리가 없으면 짧은 이름을 쓴다 */
  compact?: boolean
}

/** 부모 요소 크기(CSS px). 부모가 정하고 캔버스는 그에 맞춘다 */
interface FeedSize {
  width: number
  height: number
}

/**
 * 카메라 화면. 크기는 부모 요소가 정하고 캔버스가 ResizeObserver로 재서 그 크기로 그린다.
 * 크기가 바뀌어도 캔버스는 다시 만들어지지 않고 다시 그리기만 한다.
 */
export function CameraFeedCanvas({
  view,
  camera,
  audienceZone,
  performers,
  compact = false,
}: CameraFeedCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<FeedSize>({ width: 0, height: 0 })
  /** 그림이 늦게 불러와졌을 때 다시 그리게 하는 값 */
  const [artVersion, setArtVersion] = useState(0)
  const ratio = pixelRatio()

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const measure = () => {
      const { width, height } = host.getBoundingClientRect()
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context || size.width <= 0 || size.height <= 0) return
    const items = cameraFeed(view, camera, audienceZone).map((item) =>
      item.kind === 'actor' && compact
        ? { ...item, label: performers.get(item.id)?.shortName ?? item.label }
        : item,
    )
    const draw = () => {
      // 캔버스 픽셀은 CSS 크기 x ratio이고, 그리기는 CSS 픽셀 좌표로 한다.
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawFeed(context, performers, {
        items,
        width: size.width,
        height: size.height,
        realMs: performance.now(),
        onArtLoad: () => setArtVersion((version) => version + 1),
      })
    }
    draw()
    // 2단계 고리는 슬로모션과 관계없이 실제 0.5초 주기로 깜박이므로, 있으면 실제 시간으로 다시 그린다
    const blinks = items.some((item) => badgeLook(item.mood).blink)
    if (!blinks) return
    const timer = setInterval(draw, BLINK_REDRAW_MS)
    return () => clearInterval(timer)
  }, [view, camera, audienceZone, performers, compact, size, ratio, artVersion])

  return (
    <div ref={hostRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        width={Math.max(1, Math.round(size.width * ratio))}
        height={Math.max(1, Math.round(size.height * ratio))}
        style={{ width: size.width, height: size.height }}
        className="absolute inset-0"
        role="img"
        aria-label={`${camera.label} 카메라 화면`}
      />
    </div>
  )
}

function drawFeed(
  context: CanvasRenderingContext2D,
  performers: ReadonlyMap<string, PerformerDef>,
  input: DrawInput,
): void {
  const { items, width, height } = input
  const horizonY = height * HORIZON_RATIO
  const floorY = height * FLOOR_LINE_RATIO
  context.clearRect(0, 0, width, height)
  context.fillStyle = hex(COLORS.backWall)
  context.fillRect(0, 0, width, horizonY)
  context.fillStyle = hex(COLORS.floor)
  context.fillRect(0, horizonY, width, height - horizonY)
  context.strokeStyle = hex(COLORS.floorEdge)
  context.lineWidth = OUTLINE_WIDTH
  context.beginPath()
  context.moveTo(0, horizonY)
  context.lineTo(width, horizonY)
  context.stroke()

  const labels: PendingLabel[] = []
  for (const item of items) {
    const x = ((item.screenX + 1) / 2) * width
    if (item.kind === 'audience') {
      labels.push(drawAudience(context, item, x, horizonY, width, height))
    } else if (item.kind === 'equipment') {
      labels.push(drawEquipment(context, item, x, floorY, height))
    } else {
      labels.push(drawActor(context, item, x, floorY, height, performers, input.onArtLoad))
    }
  }
  drawLabels(context, labels, width, height, input.realMs)
}

/** 출연자 그림을 앞모습으로 그린다. 누운 포즈(날아감·쓰러짐) 그림은 원래 가로 그림이라 그대로 놓는다. */
function drawActor(
  context: CanvasRenderingContext2D,
  item: FeedItem,
  x: number,
  floorY: number,
  height: number,
  performers: ReadonlyMap<string, PerformerDef>,
  onArtLoad: () => void,
): PendingLabel {
  const bodyHeight = height * BODY_HEIGHT_RATIO * item.size
  const bottom = floorY - item.heightOffset * height * BODY_HEIGHT_RATIO
  const image = feedArtImage(item.id, item.pose ?? 'idle', onArtLoad)
  const borderColor = performers.get(item.id)?.color ?? NEUTRAL_BORDER
  // 그림이 없거나 아직 불러오는 중이면 출연자 색 사각형으로 대신한다
  let drawWidth = bodyHeight * PLACEHOLDER_ASPECT
  let drawHeight = bodyHeight
  if (image !== null && isArtReady(image)) {
    // 키 기준 그림이 몸 높이가 되는 배율을 모든 그림에 똑같이 쓴다(그림끼리 키 차이가 남는다)
    const scale = bodyHeight / REFERENCE_ART_HEIGHT_PX
    drawWidth = image.naturalWidth * scale
    drawHeight = image.naturalHeight * scale
    context.drawImage(image, x - drawWidth / 2, bottom - drawHeight, drawWidth, drawHeight)
  } else {
    context.fillStyle = borderColor
    context.fillRect(x - drawWidth / 2, bottom - drawHeight, drawWidth, drawHeight)
  }
  const top = bottom - drawHeight
  if (item.highlighted) {
    context.lineWidth = HIGHLIGHT_WIDTH
    context.strokeStyle = hex(COLORS.closeupRing)
    context.strokeRect(x - drawWidth / 2, top, drawWidth, drawHeight)
  }
  return {
    text: item.label,
    x,
    top,
    borderColor,
    icon: stageIcon(item),
  }
}

/** 대표 감정 단계에 맞는 이름표 아이콘. 0단계나 마음이 없으면 null */
function stageIcon(item: FeedItem): StageIcon | null {
  if (item.mood === null) return null
  const look = badgeLook(item.mood)
  if (look.ring === 'none') return null
  const style = emotionStyle(item.mood.emotion)
  return {
    emoji: style.icon,
    ring: look.ring,
    ringColor: look.ring === 'full' ? hex(COLORS.moodDanger) : style.color,
    blink: look.blink,
  }
}

function drawEquipment(
  context: CanvasRenderingContext2D,
  item: FeedItem,
  x: number,
  floorY: number,
  height: number,
): PendingLabel {
  const side = height * EQUIPMENT_SIZE_RATIO * item.size
  const bottom = floorY - item.heightOffset * height * BODY_HEIGHT_RATIO
  context.fillStyle = hex(item.equipmentKind === 'hangingLight' ? COLORS.light : COLORS.setWall)
  context.fillRect(x - side / 2, bottom - side, side, side)
  context.lineWidth = OUTLINE_WIDTH
  context.strokeStyle = hex(COLORS.actorOutline)
  context.strokeRect(x - side / 2, bottom - side, side, side)
  return {
    text: item.label,
    x,
    top: bottom - side,
    borderColor: NEUTRAL_BORDER,
    icon: null,
  }
}

function drawAudience(
  context: CanvasRenderingContext2D,
  item: FeedItem,
  x: number,
  horizonY: number,
  width: number,
  height: number,
): PendingLabel {
  const spread = width * AUDIENCE_SPREAD_RATIO * item.size
  const radius = height * AUDIENCE_DOT_RADIUS_RATIO * item.size
  context.fillStyle = hex(COLORS.audienceZoneLine)
  for (let index = 0; index < AUDIENCE_DOTS; index += 1) {
    // 결정적인 점 무리: 황금각으로 퍼뜨린다
    const ratio = index / AUDIENCE_DOTS
    const angle = index * GOLDEN_ANGLE
    const dotX = x + Math.cos(angle) * spread * Math.sqrt(ratio)
    const dotY =
      horizonY +
      height * AUDIENCE_DROP_RATIO +
      Math.sin(angle) * spread * AUDIENCE_FLATTEN * Math.sqrt(ratio)
    context.beginPath()
    context.arc(dotX, dotY, radius, 0, Math.PI * 2)
    context.fill()
  }
  return {
    text: item.label,
    x,
    top: horizonY + height * AUDIENCE_DROP_RATIO - spread * AUDIENCE_FLATTEN,
    borderColor: NEUTRAL_BORDER,
    icon: null,
  }
}

/** 이름표 폭: 글자 + 좌우 여백 + (단계 아이콘이 있으면) 아이콘과 간격 */
function labelWidth(textWidth: number, icon: StageIcon | null, iconDiameter: number): number {
  const iconWidth = icon === null ? 0 : iconDiameter + STAGE_ICON_GAP_PX
  return textWidth + iconWidth + LABEL_BACKGROUND_PADDING_PX * 2
}

/**
 * 이름표를 피드 폭 안에, 서로 겹치지 않게(layoutFeedLabels) 출연자 색 테두리 바탕 위에 쓴다.
 * 단계 아이콘은 이름 왼쪽에 붙는다: 1단계 반 고리, 2단계 깜박이는 꽉 찬 빨간 고리.
 */
function drawLabels(
  context: CanvasRenderingContext2D,
  labels: readonly PendingLabel[],
  width: number,
  height: number,
  realMs: number,
): void {
  const fontSize = Math.max(MIN_FONT_PX, height * NAME_FONT_RATIO)
  const lineHeight = fontSize * LABEL_LINE_RATIO
  const iconDiameter = lineHeight - STAGE_ICON_INSET_PX
  const labelFont = `${fontSize}px ${FONT_FAMILY}`
  context.font = labelFont
  const textWidths = labels.map((label) => context.measureText(label.text).width)
  const boxWidths = labels.map((label, index) =>
    labelWidth(textWidths[index], label.icon, iconDiameter),
  )
  const placements = layoutFeedLabels(
    labels.map((label, index) => ({
      x: label.x,
      bottom: label.top - LABEL_GAP_PX,
      width: boxWidths[index],
    })),
    width,
    height,
    lineHeight,
    LABEL_EDGE_PADDING_PX,
  )
  labels.forEach((label, index) => {
    const { x, y } = placements[index]
    const boxWidth = boxWidths[index]
    const left = x - boxWidth / 2
    context.fillStyle = LABEL_BACKGROUND
    context.fillRect(left, y - lineHeight, boxWidth, lineHeight)
    context.lineWidth = LABEL_BORDER_WIDTH
    context.strokeStyle = label.borderColor
    context.strokeRect(left, y - lineHeight, boxWidth, lineHeight)

    let textLeft = left + LABEL_BACKGROUND_PADDING_PX
    if (label.icon !== null) {
      drawStageIcon(
        context,
        label.icon,
        textLeft + iconDiameter / 2,
        y - lineHeight / 2,
        iconDiameter,
        realMs,
      )
      textLeft += iconDiameter + STAGE_ICON_GAP_PX
    }
    context.font = labelFont
    context.textAlign = 'left'
    context.textBaseline = 'bottom'
    context.fillStyle = hex(COLORS.nameText)
    context.fillText(label.text, textLeft, y)
  })
}

/** 감정 아이콘 + 단계 고리. 2단계 고리는 실제 시간 0.5초 주기로 켜고 끈다 */
function drawStageIcon(
  context: CanvasRenderingContext2D,
  icon: StageIcon,
  centerX: number,
  centerY: number,
  diameter: number,
  realMs: number,
): void {
  const radius = diameter / 2
  context.fillStyle = hex(COLORS.badgeDisc)
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.fill()
  context.font = `${Math.round(diameter * STAGE_ICON_FONT_RATIO)}px ${FONT_FAMILY}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(icon.emoji, centerX, centerY)
  if (icon.blink && !blinkVisible(realMs)) return
  context.lineWidth = STAGE_RING_WIDTH
  context.strokeStyle = icon.ringColor
  context.beginPath()
  // 반 고리는 위에서 시계 방향으로 반 바퀴, 꽉 찬 고리는 한 바퀴
  const end = icon.ring === 'half' ? Math.PI / 2 : Math.PI * 1.5
  context.arc(centerX, centerY, radius, -Math.PI / 2, end)
  context.stroke()
}
