import { AUTO_SLOWMO_GAUGE_RATIO } from '@/content/balance'
import { GAUGE_KINDS, type GaugeKind, type ShowDef } from '@/content/types'
import type { BroadcastView, LogLine } from '@/sim/engine'
import { useLayoutEffect, useRef } from 'react'
import { emotionStyle } from '@/render/emotionBadge'
import { containsEvent, logIndent, logTextClass, logTier } from './logFormat'
import { logSegments, type LogPerson } from './logSegments'
import { GAUGE_LABELS, formatShowClock, formatShowEnd, formatViewers } from './labels'
import type { LayoutMode } from './layout'
import { LayoutToggle } from './LayoutToggle'

/** 사고 로그에 보여 주는 최근 줄 수 */
const LOG_LINES_SHOWN = 60
/** 게이지 막대 전체 길이가 상한의 몇 배인지. 상한 눈금이 막대 안쪽에 보이게 여유를 둔다. */
const GAUGE_TRACK_SCALE = 1.25

const TREND_MARKS: Record<BroadcastView['viewersTrend'], { mark: string; className: string }> = {
  1: { mark: '▲', className: 'text-emerald-400' },
  0: { mark: '–', className: 'text-slate-400' },
  [-1]: { mark: '▼', className: 'text-red-400' },
}

/** 위 띠 높이(px). 모든 글이 한 줄이다 */
export const TOP_BAND_HEIGHT = 52

interface TopBandProps {
  view: BroadcastView
  show: ShowDef
  /** 자동 슬로모션 계기나 중단 원인이라 깜박일 게이지 */
  alertGauge: GaugeKind | null
  layout: LayoutMode
  onLayoutChange(mode: LayoutMode): void
}

/**
 * 위 띠(spec 2절, 세 배치 공통): 수위 게이지 4개 | 시청자 수·추세 | 극 중 시각 | 코너 | 배치 버튼.
 * 모든 글이 한 줄이다(whitespace-nowrap).
 */
export function TopBand({ view, show, alertGauge, layout, onLayoutChange }: TopBandProps) {
  const corner = show.corners[view.cornerIndex]
  const trend = TREND_MARKS[view.viewersTrend]
  return (
    <header
      data-testid="top-band"
      className="flex shrink-0 items-center gap-2 whitespace-nowrap px-3"
      style={{ height: TOP_BAND_HEIGHT }}
    >
      <section className="flex shrink-0 gap-1 rounded-lg border-2 border-slate-700 bg-slate-900 p-1">
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
      <section className="ml-auto flex shrink-0 items-baseline gap-2 rounded-lg border-2 border-slate-700 bg-slate-900 px-3 py-1">
        <span className="text-[11px] text-slate-400">시청자</span>
        <span data-testid="viewers" className="text-xl font-black tabular-nums text-slate-100">
          {formatViewers(view.viewers)}
        </span>
        <span data-testid="viewers-trend" className={`text-base font-bold ${trend.className}`}>
          {trend.mark}
        </span>
      </section>
      <section
        aria-label="방송 시각"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-slate-700 bg-slate-900 px-3 py-1"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
        <span
          data-testid="broadcast-time"
          className="flex items-baseline gap-1.5 text-xl font-black tabular-nums text-amber-300"
        >
          {formatShowClock(view.step, show)}
          <span className="text-sm font-bold text-slate-400">/ {formatShowEnd(show)}</span>
        </span>
      </section>
      <div
        data-testid="corner"
        className="shrink-0 rounded-lg border-2 border-amber-200 bg-amber-400 px-3 py-1 text-base font-black text-slate-950 shadow-[2px_2px_0_#000]"
      >
        {corner.label} {view.cornerIndex + 1}/{show.corners.length}
      </div>
      <LayoutToggle mode={layout} onSelect={onLayoutChange} />
    </header>
  )
}

interface GaugeMeterProps {
  gauge: GaugeKind
  value: number
  limit: number
  alert: boolean
}

/** 게이지 하나(한 줄: 이름, 막대, 값). 상한의 80% 이상이면 그 게이지만 빨간 테두리(spec 8.2 강조 규칙). */
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
      className={`flex items-center gap-1.5 rounded-md border-2 px-1.5 py-1 ${
        highlighted ? 'border-red-500 bg-red-950/70' : 'border-transparent bg-slate-950'
      } ${alert ? 'animate-pulse' : ''}`}
    >
      <span
        className={`w-9 text-xs font-bold ${highlighted ? 'text-red-200' : 'text-slate-200'}`}
      >
        {GAUGE_LABELS[gauge]}
      </span>
      <div className="relative h-2.5 w-10 rounded-sm bg-slate-800">
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
          className="absolute -top-1 h-[18px] w-0.5 bg-red-400"
          style={{ left: `${limitPercent}%` }}
        />
      </div>
      <span className="min-w-8 text-right text-[11px] tabular-nums text-slate-400">
        {Math.round(value)}/{limit}
      </span>
    </div>
  )
}

interface EventLogProps {
  log: readonly LogLine[]
  /** 자동 슬로모션 계기 이벤트. 그 줄을 강조한다. */
  highlightedEventId: number | null
  show: ShowDef
  /** 줄 속 이름을 칠할 출연자(정식 이름과 짧은 이름). 없으면 이름을 칠하지 않는다 */
  people?: readonly LogPerson[]
}

/** 맨 아래에서 이 거리(px) 안이면 새 줄이 올 때 따라 내려간다 */
const LOG_FOLLOW_THRESHOLD_PX = 8
/** 앞머리(이어받은 줄의 "○○의 △△에 이어")를 흐리게 하는 투명도 */
const LOG_LEAD_IN_OPACITY = 0.5
/** 사고 줄에 출연자 이름이 없을 때의 띠 색 */
const LOG_INCIDENT_BAND_FALLBACK = '#e2e8f0'
const NO_PEOPLE: readonly LogPerson[] = []

/** 스크롤 위치가 맨 아래에서 LOG_FOLLOW_THRESHOLD_PX 이내인지 */
function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= LOG_FOLLOW_THRESHOLD_PX
}

/**
 * 왼쪽 열의 사고 로그(spec 8절). 3단 위계: 사고는 색 띠와 흰 굵은 글, 감정 단계는 감정 색과 아이콘, 나머지는
 * 흐린 기울임. 연쇄 깊이만큼 들여쓴다. 맨 아래를 보고 있으면 새 줄을 따라가고, 위로 올려 읽는 중이면 따라가지 않는다.
 */
export function EventLog({ log, highlightedEventId, show, people = NO_PEOPLE }: EventLogProps) {
  const recent = log.slice(-LOG_LINES_SHOWN)
  const listRef = useRef<HTMLOListElement>(null)
  const followingRef = useRef(true)
  const newestIndex = recent.at(-1)?.index ?? -1
  useLayoutEffect(() => {
    const list = listRef.current
    if (list !== null && followingRef.current) list.scrollTop = list.scrollHeight
  }, [newestIndex])
  return (
    <section
      data-testid="event-log"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-slate-800 bg-slate-900/60 px-2.5 py-2"
    >
      <div className="mb-1 text-[11px] font-bold text-slate-500">사고 로그</div>
      {recent.length === 0 && <div className="text-xs text-slate-500">아직 아무 일도 없습니다.</div>}
      {/* 긴 줄은 자르지 않고 줄바꿈한다. 줄이 모자라면 아래(최신)에 붙고, 넘치면 스크롤한다 */}
      <ol
        ref={listRef}
        data-testid="event-log-list"
        onScroll={(event) => {
          followingRef.current = isNearBottom(event.currentTarget)
        }}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto text-xs leading-4 text-slate-300 [&>li:first-child]:mt-auto"
      >
        {recent.map((line) => (
          <LogRow
            key={line.index}
            line={line}
            show={show}
            people={people}
            highlighted={containsEvent(line, highlightedEventId)}
          />
        ))}
      </ol>
    </section>
  )
}

interface LogRowProps {
  line: LogLine
  show: ShowDef
  people: readonly LogPerson[]
  highlighted: boolean
}

function LogRow({ line, show, people, highlighted }: LogRowProps) {
  const tier = logTier(line)
  const segments = logSegments(line, people)
  const heroColor = segments.find((segment) => segment.color !== null && !segment.dim)?.color ?? null
  const stageStyle = line.kind === 'stage' && line.emotion !== null ? emotionStyle(line.emotion) : null
  return (
    <li
      data-log-index={line.index}
      data-log-tier={tier}
      className={`flex shrink-0 rounded-sm border-l-[3px] pl-1 ${
        highlighted ? 'bg-amber-500/30 text-amber-100' : tier === 3 ? 'bg-slate-800/60' : ''
      }`}
      style={{ borderLeftColor: tier === 3 ? (heroColor ?? LOG_INCIDENT_BAND_FALLBACK) : 'transparent' }}
    >
      <span className="w-10 shrink-0 tabular-nums text-slate-500">
        {formatShowClock(line.step, show)}
      </span>
      <span
        className={`min-w-0 break-keep ${logTextClass(line)}`}
        data-log-text={line.text}
        style={{
          paddingLeft: `${logIndent(line.depth)}px`,
          ...(stageStyle === null ? {} : { color: stageStyle.color }),
        }}
      >
        {line.depth > 1 && <span className="text-slate-500">└ </span>}
        {stageStyle !== null && <span aria-hidden="true">{stageStyle.icon} </span>}
        {segments.map((segment, index) => (
          <span
            key={index}
            style={{
              ...(segment.color === null ? {} : { color: segment.color }),
              ...(segment.dim ? { opacity: LOG_LEAD_IN_OPACITY } : {}),
            }}
          >
            {segment.text}
          </span>
        ))}
      </span>
      {line.repeat > 1 && (
        <span className="ml-1 shrink-0 tabular-nums text-slate-500">×{line.repeat}</span>
      )}
    </li>
  )
}
