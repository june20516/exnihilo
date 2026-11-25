import { useEffect, useRef } from 'react'
import type { CameraDef, ShowDef } from '@/content/types'
import { COLORS, POSE_COLORS, POSE_SYMBOLS } from '@/render/colors'
import { cameraFeed, type FeedItem, type FeedView } from '@/render/cameraFeed'
import { layoutFeedLabels } from '@/render/feedLabels'

/** 피드 픽셀 상수 */
const HORIZON_RATIO = 0.35
const FLOOR_LINE_RATIO = 0.75
const BODY_HEIGHT_RATIO = 0.3
const BODY_ASPECT = 0.4
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

/** 몸 위에 붙일 이름표. 다 그린 뒤 한꺼번에 겹치지 않게 놓는다. */
interface PendingLabel {
  text: string
  x: number
  top: number
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

interface CameraFeedCanvasProps {
  view: FeedView
  camera: CameraDef
  audienceZone: ShowDef['audienceZone']
  width: number
  height: number
}

export function CameraFeedCanvas({
  view,
  camera,
  audienceZone,
  width,
  height,
}: CameraFeedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    drawFeed(context, cameraFeed(view, camera, audienceZone), width, height)
  }, [view, camera, audienceZone, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label={`${camera.label} 카메라 화면`}
    />
  )
}

function drawFeed(
  context: CanvasRenderingContext2D,
  items: FeedItem[],
  width: number,
  height: number,
): void {
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
      labels.push(drawActor(context, item, x, floorY, height))
    }
  }
  drawLabels(context, labels, width, height)
}

function drawActor(
  context: CanvasRenderingContext2D,
  item: FeedItem,
  x: number,
  floorY: number,
  height: number,
): PendingLabel {
  const bodyHeight = height * BODY_HEIGHT_RATIO * item.size
  const bodyWidth = bodyHeight * BODY_ASPECT
  const bottom = floorY - item.heightOffset * height * BODY_HEIGHT_RATIO
  const pose = item.pose ?? 'idle'
  context.fillStyle = hex(POSE_COLORS[pose])
  context.fillRect(x - bodyWidth / 2, bottom - bodyHeight, bodyWidth, bodyHeight)
  context.lineWidth = item.highlighted ? HIGHLIGHT_WIDTH : OUTLINE_WIDTH
  context.strokeStyle = item.highlighted ? hex(COLORS.trackingIcon) : hex(COLORS.actorOutline)
  context.strokeRect(x - bodyWidth / 2, bottom - bodyHeight, bodyWidth, bodyHeight)
  return { text: `${item.label}${POSE_SYMBOLS[pose]}`, x, top: bottom - bodyHeight }
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
  return { text: item.label, x, top: bottom - side }
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
  }
}

/** 이름표를 피드 폭 안에, 서로 겹치지 않게(layoutFeedLabels) 반투명 바탕 위에 쓴다. */
function drawLabels(
  context: CanvasRenderingContext2D,
  labels: readonly PendingLabel[],
  width: number,
  height: number,
): void {
  const fontSize = Math.max(MIN_FONT_PX, height * NAME_FONT_RATIO)
  const lineHeight = fontSize * LABEL_LINE_RATIO
  context.font = `${fontSize}px ${FONT_FAMILY}`
  context.textAlign = 'center'
  context.textBaseline = 'bottom'
  const widths = labels.map((label) => context.measureText(label.text).width)
  const placements = layoutFeedLabels(
    labels.map((label, index) => ({
      x: label.x,
      bottom: label.top - LABEL_GAP_PX,
      width: widths[index] + LABEL_BACKGROUND_PADDING_PX * 2,
    })),
    width,
    height,
    lineHeight,
    LABEL_EDGE_PADDING_PX,
  )
  labels.forEach((label, index) => {
    const { x, y } = placements[index]
    const boxWidth = widths[index] + LABEL_BACKGROUND_PADDING_PX * 2
    context.fillStyle = LABEL_BACKGROUND
    context.fillRect(x - boxWidth / 2, y - lineHeight, boxWidth, lineHeight)
    context.fillStyle = hex(COLORS.nameText)
    context.fillText(label.text, x, y)
  })
}
