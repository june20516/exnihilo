import { AUTO_SLOWMO_GAUGE_RATIO } from '@/content/balance'
import { GAUGE_KINDS, type GaugeKind, type ShowDef } from '@/content/types'
import type { BroadcastView, LogLine } from '@/sim/engine'
import { containsEvent, logIndent, logTextClass } from './logFormat'
import { GAUGE_LABELS, formatShowClock, formatShowEnd, formatViewers } from './labels'

/** 사고 로그에 보여 주는 최근 줄 수 */
const LOG_LINES_SHOWN = 14
/** 게이지 막대 전체 길이가 상한의 몇 배인지. 상한 눈금이 막대 안쪽에 보이게 여유를 둔다. */
const GAUGE_TRACK_SCALE = 1.25

const TREND_MARKS: Record<BroadcastView['viewersTrend'], { mark: string; className: string }> = {
  1: { mark: '▲', className: 'text-emerald-400' },
  0: { mark: '–', className: 'text-slate-400' },
  [-1]: { mark: '▼', className: 'text-red-400' },
}

interface TopBandProps {
  view: BroadcastView
  show: ShowDef
  /** 자동 슬로모션 계기나 중단 원인이라 깜박일 게이지 */
  alertGauge: GaugeKind | null
}

/** 위 띠(spec 8.2 1단계): 수위 게이지 4개 | 시청자 수·추세·남은 시간 | 코너 */
export function TopBand({ view, show, alertGauge }: TopBandProps) {
  const corner = show.corners[view.cornerIndex]
  const trend = TREND_MARKS[view.viewersTrend]
  return (
    <header className="flex h-[96px] shrink-0 items-center gap-4 px-3">
      <section className="flex gap-2 rounded-xl border-2 border-slate-700 bg-slate-900 p-1.5">
        {GAUGE_KINDS.map((gauge) => (
          <GaugeMeter
            key={gauge}
            gauge={gauge}
            value={view.gauges[gauge]}
            limit={view.limits[gauge]}
            alert={alertGauge === gauge || view.haltedBy === gauge}
          />
        ))}
      </section>
      <section className="mx-auto flex items-center gap-4 rounded-xl border-2 border-slate-700 bg-slate-900 px-5 py-2">
        <div className="flex flex-col leading-none">
          <span className="text-[11px] text-slate-400">시청자 수</span>
          <span className="flex items-baseline gap-1.5">
            <span data-testid="viewers" className="text-3xl font-black tabular-nums text-slate-100">
              {formatViewers(view.viewers)}
            </span>
            <span data-testid="viewers-trend" className={`text-xl font-bold ${trend.className}`}>
              {trend.mark}
            </span>
          </span>
        </div>
        <div className="h-10 w-px bg-slate-700" />
        <div className="flex flex-col leading-none">
          <span className="text-[11px] text-slate-400">방송 시각</span>
          <span
            data-testid="broadcast-time"
            className="flex items-center gap-1.5 text-3xl font-black tabular-nums text-amber-300"
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            {formatShowClock(view.step, show)}
            <span className="text-base font-bold text-slate-400">/ {formatShowEnd(show)}</span>
          </span>
        </div>
      </section>
      <div
        data-testid="corner"
        className="-rotate-2 rounded-lg border-2 border-amber-200 bg-amber-400 px-4 py-2 text-xl font-black text-slate-950 shadow-[3px_3px_0_#000]"
      >
        {corner.label} {view.cornerIndex + 1}/{show.corners.length}
      </div>
    </header>
  )
}

interface GaugeMeterProps {
  gauge: GaugeKind
  value: number
  limit: number
  alert: boolean
}

/** 게이지 하나. 상한의 80% 이상이면 그 게이지만 빨간 테두리(spec 8.2 강조 규칙). */
function GaugeMeter({ gauge, value, limit, alert }: GaugeMeterProps) {
  const trackMax = limit * GAUGE_TRACK_SCALE
  const fillPercent = Math.min(100, (value / trackMax) * 100)
  const limitPercent = (limit / trackMax) * 100
  const warnPercent = limitPercent * AUTO_SLOWMO_GAUGE_RATIO
  const highlighted = value >= limit * AUTO_SLOWMO_GAUGE_RATIO
  return (
    <div
      data-testid={`gauge-${gauge}`}
      data-highlighted={highlighted}
      className={`flex w-[116px] flex-col gap-1 rounded-lg border-2 px-2 py-1.5 ${
        highlighted ? 'border-red-500 bg-red-950/70' : 'border-transparent bg-slate-950'
      } ${alert ? 'animate-pulse' : ''}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-bold ${highlighted ? 'text-red-200' : 'text-slate-200'}`}>
          {GAUGE_LABELS[gauge]}
        </span>
        <span className="text-[11px] tabular-nums text-slate-400">
          {Math.round(value)}/{limit}
        </span>
      </div>
      <div className="relative h-3 rounded-sm bg-slate-800">
        {/* 자동 슬로모션 경계(상한의 80%)부터 상한까지의 빨간 구간 */}
        <div
          className="absolute inset-y-0 bg-red-900/70"
          style={{ left: `${warnPercent}%`, width: `${limitPercent - warnPercent}%` }}
        />
        <div
          className={`relative h-full rounded-sm ${highlighted ? 'bg-red-500' : 'bg-emerald-400'}`}
          style={{ width: `${fillPercent}%` }}
        />
        <div
          className="absolute -top-1 h-5 w-0.5 bg-red-400"
          style={{ left: `${limitPercent}%` }}
        />
      </div>
    </div>
  )
}

interface EventLogProps {
  log: readonly LogLine[]
  /** 자동 슬로모션 계기 이벤트. 그 줄을 강조한다. */
  highlightedEventId: number | null
  show: ShowDef
}

/** 평소 왼쪽 열의 작고 흐린 사고 로그(spec 8.2 5단계). 연쇄 깊이만큼 들여쓴다. */
export function EventLog({ log, highlightedEventId, show }: EventLogProps) {
  const recent = log.slice(-LOG_LINES_SHOWN)
  return (
    <section
      data-testid="event-log"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-slate-800 bg-slate-900/60 px-2.5 py-2 opacity-80"
    >
      <div className="mb-1 text-[11px] font-bold text-slate-500">사고 로그</div>
      {recent.length === 0 && <div className="text-xs text-slate-500">아직 아무 일도 없습니다.</div>}
      <ol className="flex flex-col gap-0.5 text-xs leading-4 text-slate-300">
        {recent.map((line) => (
          <li
            key={line.index}
            data-log-index={line.index}
            className={`flex rounded-sm ${
              containsEvent(line, highlightedEventId) ? 'bg-amber-500/30 text-amber-100' : ''
            }`}
          >
            <span className="w-10 shrink-0 tabular-nums text-slate-500">
              {formatShowClock(line.step, show)}
            </span>
            <span
              className={`min-w-0 truncate ${logTextClass(line)}`}
              title={line.text}
              style={{ paddingLeft: `${logIndent(line.depth)}px` }}
            >
              {line.depth > 1 && <span className="text-slate-500">└ </span>}
              {line.text}
            </span>
            {line.repeat > 1 && (
              <span className="ml-1 shrink-0 tabular-nums text-slate-500">×{line.repeat}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
