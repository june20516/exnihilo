import { useCallback, useEffect, useRef, useState } from 'react'
import { CAPSULE, LIGHT_HALF_EXTENTS, SET_WALL_HALF_EXTENTS } from '@/content/balance'
import type { BackdropKind, CameraDef, PerformerDef, ShowDef } from '@/content/types'
import { REFERENCE_ART_HEIGHT_PX } from '@/render/actorFigure'
import { crowdDots, feedBackdropLayout, type FeedBackdropLayout } from '@/render/backdrop'
import { COLORS } from '@/render/colors'
import { cameraFeed, type EquipmentKind, type FeedItem, type FeedView } from '@/render/cameraFeed'
import { blinkVisible, badgeLook, emotionStyle } from '@/render/emotionBadge'
import { feedArtImage, feedBackdropImage, isArtReady } from '@/render/feedArt'
import { feedNameFontSize, layoutFeedLabels } from '@/render/feedLabels'

/**
 * 피드 픽셀 상수. 높이 비율은 배경 그림이 놓인 높이(cover) 대비다.
 * 몸 높이 0.36: 와이드(size 약 0.75)에서 키가 그림 높이의 약 0.27이라, 무대 그림의 벽(바닥선 0.615에서
 * 천장 띠 약 0.1까지, 0.5)의 반쯤 된다. 0.3이면 창 벽 앞 출연자가 장난감처럼 작아 보였다.
 */
const BODY_HEIGHT_RATIO = 0.36
/** 배경 그림 위에 까는 어두운 덮개(검정 15%). 밝은 창 야경 앞에서도 출연자 외곽선과 이름표가 묻히지 않게 한다 */
const BACKDROP_DIM = 'rgba(0, 0, 0, 0.15)'
/** 그림이 없거나 아직 불러오는 중일 때 대신 그리는 사각형의 가로/세로 */
const PLACEHOLDER_ASPECT = 0.4
const HIGHLIGHT_WIDTH = 3
const OUTLINE_WIDTH = 1.5
const EQUIPMENT_SIZE_RATIO = 0.18
/**
 * 바닥에 놓였을 때의 몸·장비 중심 높이(m). heightOffset은 중심 높이라, 이만큼을 빼야 서 있는
 * 출연자와 바닥의 세트 벽이 발 기준선에 닿는다(스튜디오 그림자의 lift와 같은 기준).
 */
const STANDING_CENTER_METERS = CAPSULE.halfHeight + CAPSULE.radius
const EQUIPMENT_REST_CENTER_METERS: Readonly<Record<EquipmentKind, number>> = {
  hangingLight: LIGHT_HALF_EXTENTS.hy,
  setWall: SET_WALL_HALF_EXTENTS.hy,
}
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
  backdrop: BackdropKind
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
  /** 참조를 고정해 둬야 로드 전 그리기를 여러 번 해도 feedArt의 대기 콜백이 쌓이지 않는다 */
  const onArtLoad = useCallback(() => setArtVersion((version) => version + 1), [])
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
        backdrop: camera.backdrop,
        width: size.width,
        height: size.height,
        realMs: performance.now(),
        onArtLoad,
      })
    }
    draw()
    // 2단계 고리는 슬로모션과 관계없이 실제 0.5초 주기로 깜박이므로, 있으면 실제 시간으로 다시 그린다
    const blinks = items.some((item) => badgeLook(item.mood).blink)
    if (!blinks) return
    const timer = setInterval(draw, BLINK_REDRAW_MS)
    return () => clearInterval(timer)
  }, [view, camera, audienceZone, performers, compact, size, ratio, artVersion, onArtLoad])

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
  const layout = feedBackdropLayout(input.backdrop, width, height)
  context.clearRect(0, 0, width, height)
  drawBackdrop(context, layout, input)

  const labels: PendingLabel[] = []
  for (const item of items) {
    const x = ((item.screenX + 1) / 2) * width
    if (item.kind === 'audience') {
      labels.push(drawAudience(context, item, x, layout, width))
    } else if (item.kind === 'equipment') {
      labels.push(drawEquipment(context, item, x, layout))
    } else {
      labels.push(drawActor(context, item, x, layout, performers, input.onArtLoad))
    }
  }
  drawLabels(context, labels, width, height, input.realMs)
}

/** 배경 그림을 cover로 깔고 살짝 어둡게 덮는다. 불러오기 전이면 같은 수평선으로 단색 벽·바닥을 칠한다 */
function drawBackdrop(
  context: CanvasRenderingContext2D,
  layout: FeedBackdropLayout,
  input: DrawInput,
): void {
  const { width, height } = input
  const image = feedBackdropImage(input.backdrop, input.onArtLoad)
  if (image !== null && isArtReady(image)) {
    const { x, y, width: drawWidth, height: drawHeight } = layout.image
    context.drawImage(image, x, y, drawWidth, drawHeight)
    context.fillStyle = BACKDROP_DIM
    context.fillRect(0, 0, width, height)
    return
  }
  const horizonY = layout.horizonY
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
}

/** 출연자 그림을 앞모습으로 그린다. 누운 포즈(날아감·쓰러짐) 그림은 원래 가로 그림이라 그대로 놓는다. */
function drawActor(
  context: CanvasRenderingContext2D,
  item: FeedItem,
  x: number,
  layout: FeedBackdropLayout,
  performers: ReadonlyMap<string, PerformerDef>,
  onArtLoad: () => void,
): PendingLabel {
  const unit = layout.image.height * BODY_HEIGHT_RATIO
  const bodyHeight = unit * item.size
  const bottom = layout.footY - liftAboveRest(item, STANDING_CENTER_METERS) * unit
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

/** 바닥에 놓인 상태(중심 높이 restCenter m)보다 더 뜬 높이(m) × size. 누운 몸처럼 낮으면 0 */
function liftAboveRest(item: FeedItem, restCenter: number): number {
  return Math.max(0, item.heightOffset - restCenter * item.size)
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
  layout: FeedBackdropLayout,
): PendingLabel {
  const side = layout.image.height * EQUIPMENT_SIZE_RATIO * item.size
  const rest = item.equipmentKind === null ? 0 : EQUIPMENT_REST_CENTER_METERS[item.equipmentKind]
  const bottom = layout.footY - liftAboveRest(item, rest) * layout.image.height * BODY_HEIGHT_RATIO
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
  layout: FeedBackdropLayout,
  width: number,
): PendingLabel {
  const crowd = crowdDots(x, item.size, width, layout)
  context.fillStyle = hex(COLORS.audienceZoneLine)
  for (const dot of crowd.dots) {
    context.beginPath()
    context.arc(dot.x, dot.y, crowd.radius, 0, Math.PI * 2)
    context.fill()
  }
  return {
    text: item.label,
    x,
    top: crowd.top,
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
  const fontSize = feedNameFontSize(height)
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
