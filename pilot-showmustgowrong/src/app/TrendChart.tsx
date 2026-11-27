import { STEP_SECONDS } from '@/content/balance'
import type { ShowDef } from '@/content/types'
import { formatShowClock } from './labels'
import type { TrendSeries } from './trendRecorder'

/** 그림 크기(viewBox 단위 = 화면 px). 왼쪽 칸 폭 260px에 맞춘다 */
const CHART_WIDTH = 244
const CHART_HEIGHT = 100
const PLOT_LEFT = 32
const PLOT_RIGHT = CHART_WIDTH - 4
const PLOT_TOP = 4
const PLOT_BOTTOM = 62
const AXIS_LABEL_Y = 74
const LEGEND_Y = 92
/** 1단계·2단계 점선의 근접도(감정 문턱을 50·80으로 맞춘 값, spec 5절) */
const STAGE_LINES = [
  { value: 80, label: '2단계' },
  { value: 50, label: '1단계' },
] as const
/** clock 축의 눈금 수(양 끝 포함) */
const CLOCK_TICKS = 4
const FALLBACK_COLOR = '#94A3B8'
/** 범례 한 줄에 놓는 항목 수와 칸 너비. 넘치면 다음 줄로 감싼다 */
const LEGEND_PER_ROW = 5
const LEGEND_STEP = (CHART_WIDTH - 8) / LEGEND_PER_ROW
const LEGEND_ROW_HEIGHT = 11

export interface TrendChartProps {
  series: readonly TrendSeries[]
  /** 출연자 id → 선 색 */
  colors: Readonly<Record<string, string>>
  /** 출연자 id → 범례에 쓰는 짧은 이름 */
  names: Readonly<Record<string, string>>
  fromStep: number
  toStep: number
  /** relative는 "-60초 … 지금"(생방송), clock은 극 중 시각 눈금(정산) */
  axis: 'relative' | 'clock'
  show: ShowDef
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** 점 목록을 path d로. 값이 null인 점에서 선이 끊긴다(이탈·마음 없음). 점 하나만 있으면 둥근 점으로 보인다 */
function linePath(
  points: TrendSeries['points'],
  xOf: (step: number) => number,
  yOf: (value: number) => number,
  fromStep: number,
  toStep: number,
): string {
  const commands: string[] = []
  let drawing = false
  let lastPoint: string | null = null
  const flushLonePoint = (): void => {
    if (drawing && lastPoint !== null && commands.at(-1) === `M${lastPoint}`) commands.push(`L${lastPoint}`)
  }
  for (const { step, value } of points) {
    if (step < fromStep || step > toStep) continue
    if (value === null) {
      flushLonePoint()
      drawing = false
      continue
    }
    const coordinate = `${round(xOf(step))} ${round(yOf(value))}`
    commands.push(`${drawing ? 'L' : 'M'}${coordinate}`)
    drawing = true
    lastPoint = coordinate
  }
  flushLonePoint()
  return commands.join(' ')
}

/** 출연자별 "터지기 직전 정도"(0~100) 추세. 오른쪽 끝이 지금이고 선은 왼쪽으로 흐른다(spec 5절) */
export function TrendChart({ series, colors, names, fromStep, toStep, axis, show }: TrendChartProps) {
  const span = Math.max(1, toStep - fromStep)
  const xOf = (step: number): number => PLOT_LEFT + ((step - fromStep) / span) * (PLOT_RIGHT - PLOT_LEFT)
  const yOf = (value: number): number => PLOT_BOTTOM - (value / 100) * (PLOT_BOTTOM - PLOT_TOP)
  const windowSeconds = Math.round(span * STEP_SECONDS)
  const ticks: { x: number; text: string; anchor: 'start' | 'middle' | 'end' }[] =
    axis === 'clock'
      ? Array.from({ length: CLOCK_TICKS }, (_, index) => {
          const ratio = index / (CLOCK_TICKS - 1)
          const anchor = index === 0 ? 'start' : index === CLOCK_TICKS - 1 ? 'end' : 'middle'
          return {
            x: PLOT_LEFT + ratio * (PLOT_RIGHT - PLOT_LEFT),
            text: formatShowClock(fromStep + ratio * span, show),
            anchor,
          }
        })
      : [
          { x: PLOT_LEFT, text: `-${windowSeconds}초`, anchor: 'start' },
          { x: PLOT_RIGHT, text: '지금', anchor: 'end' },
        ]
  // 무대에 오른 적 없는 출연자(값이 하나도 없는 시리즈)는 선이 없으니 범례에도 넣지 않는다
  const legendSeries = series.filter(({ points }) => points.some(({ value }) => value !== null))
  const chartHeight =
    CHART_HEIGHT + (Math.max(1, Math.ceil(legendSeries.length / LEGEND_PER_ROW)) - 1) * LEGEND_ROW_HEIGHT
  return (
    <svg
      data-testid="trend-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
      width={CHART_WIDTH}
      height={chartHeight}
      className="block max-w-full select-none"
      role="img"
      aria-label="출연자별 터지기 직전 정도 추세"
    >
      <rect
        x={PLOT_LEFT}
        y={PLOT_TOP}
        width={PLOT_RIGHT - PLOT_LEFT}
        height={PLOT_BOTTOM - PLOT_TOP}
        fill="#0f172a"
        stroke="#334155"
      />
      {STAGE_LINES.map(({ value, label }) => (
        <g key={label}>
          <line
            x1={PLOT_LEFT}
            x2={PLOT_RIGHT}
            y1={yOf(value)}
            y2={yOf(value)}
            stroke="#64748b"
            strokeDasharray="3 3"
          />
          <text x={PLOT_LEFT - 4} y={yOf(value) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
            {label}
          </text>
        </g>
      ))}
      {series.map(({ actorId, points }) => {
        const d = linePath(points, xOf, yOf, fromStep, toStep)
        return d === '' ? null : (
          <path
            key={actorId}
            data-trend-line={actorId}
            d={d}
            fill="none"
            stroke={colors[actorId] ?? FALLBACK_COLOR}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}
      {ticks.map(({ x, text, anchor }) => (
        <text key={`${x}`} x={x} y={AXIS_LABEL_Y} textAnchor={anchor} fontSize={9} fill="#94a3b8">
          {text}
        </text>
      ))}
      {legendSeries.map(({ actorId }, index) => (
        <g key={actorId} transform={`translate(${4 + (index % LEGEND_PER_ROW) * LEGEND_STEP} ${LEGEND_Y + Math.floor(index / LEGEND_PER_ROW) * LEGEND_ROW_HEIGHT})`}>
          <rect y={-5} width={8} height={3} rx={1} fill={colors[actorId] ?? FALLBACK_COLOR} />
          <text x={11} y={0} fontSize={9} fill="#cbd5e1">
            {names[actorId] ?? actorId}
          </text>
        </g>
      ))}
    </svg>
  )
}
