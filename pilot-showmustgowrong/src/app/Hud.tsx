import { AUTO_SLOWMO_GAUGE_RATIO } from '@/content/balance'
import { GAUGE_KINDS, type CameraDef, type GaugeKind, type ShowDef } from '@/content/types'
import type { BroadcastView, LogLine } from '@/sim/engine'
import { GAUGE_LABELS, SWITCHER_KEYS, formatRemaining, formatStepTime, formatViewers } from './labels'

/** 사고 로그에 보여 주는 최근 줄 수 */
const LOG_LINES_SHOWN = 8
/** 연쇄 깊이 한 단계의 들여쓰기(px) */
const LOG_INDENT_PX = 18
/** 게이지 막대 전체 길이가 상한의 몇 배인지. 상한 눈금이 막대 안쪽에 보이게 여유를 둔다. */
const GAUGE_TRACK_SCALE = 1.25

interface HudProps {
  view: BroadcastView
  show: ShowDef
}

export function ViewerBoard({ view, show }: HudProps) {
  const corner = show.corners[view.cornerIndex]
  return (
    <section className="rounded border border-neutral-700 bg-neutral-900 p-3">
      <div className="text-xs text-neutral-400">시청자 수</div>
      <div data-testid="viewers" className="text-3xl font-bold tabular-nums text-amber-300">
        {formatViewers(view.viewers)}
      </div>
      <div className="mt-2 flex items-baseline justify-between text-sm">
        <span data-testid="broadcast-time" className="tabular-nums">
          남은 시간 <b className="text-lg">{formatRemaining(view.step)}</b>
        </span>
        <span data-testid="corner" className="text-neutral-300">
          코너 {view.cornerIndex + 1}/3 · {corner.label}
        </span>
      </div>
    </section>
  )
}

interface GaugeMetersProps {
  view: BroadcastView
  /** 자동 슬로모션 중 강조할 게이지 */
  highlighted: GaugeKind | null
}

export function GaugeMeters({ view, highlighted }: GaugeMetersProps) {
  return (
    <section className="space-y-1.5 rounded border border-neutral-700 bg-neutral-900 p-3">
      <div className="text-xs text-neutral-400">수위 게이지</div>
      {GAUGE_KINDS.map((gauge) => (
        <GaugeBar
          key={gauge}
          gauge={gauge}
          value={view.gauges[gauge]}
          limit={view.limits[gauge]}
          highlighted={highlighted === gauge || view.haltedBy === gauge}
        />
      ))}
    </section>
  )
}

interface GaugeBarProps {
  gauge: GaugeKind
  value: number
  limit: number
  highlighted: boolean
}

function GaugeBar({ gauge, value, limit, highlighted }: GaugeBarProps) {
  const trackMax = limit * GAUGE_TRACK_SCALE
  const fillPercent = Math.min(100, (value / trackMax) * 100)
  const limitPercent = (limit / trackMax) * 100
  const warnPercent = limitPercent * AUTO_SLOWMO_GAUGE_RATIO
  const danger = value >= limit * AUTO_SLOWMO_GAUGE_RATIO
  return (
    <div
      data-testid={`gauge-${gauge}`}
      className={`flex items-center gap-2 text-sm ${highlighted ? 'animate-pulse' : ''}`}
    >
      <span className="w-12 shrink-0">{GAUGE_LABELS[gauge]}</span>
      <div className="relative h-3 flex-1 rounded-sm bg-neutral-800">
        <div
          className={`h-full rounded-sm ${danger ? 'bg-red-500' : 'bg-sky-500'}`}
          style={{ width: `${fillPercent}%` }}
        />
        {/* 자동 슬로모션 경계(상한의 80%)와 상한 눈금 */}
        <div
          className="absolute -top-0.5 h-4 w-px bg-amber-400/70"
          style={{ left: `${warnPercent}%` }}
        />
        <div className="absolute -top-1 h-5 w-0.5 bg-red-400" style={{ left: `${limitPercent}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-neutral-300">
        {Math.round(value)}/{limit}
      </span>
    </div>
  )
}

interface CameraSwitcherProps {
  cameras: readonly CameraDef[]
  onAirCameraId: string
  onSwitch(cameraId: string): void
}

export function CameraSwitcher({ cameras, onAirCameraId, onSwitch }: CameraSwitcherProps) {
  return (
    <section className="flex w-44 shrink-0 flex-col gap-1.5" aria-label="카메라 스위처">
      {cameras.map((camera, index) => {
        const onAir = camera.id === onAirCameraId
        return (
          <button
            key={camera.id}
            type="button"
            data-testid={`switcher-${camera.id}`}
            aria-pressed={onAir}
            onClick={() => onSwitch(camera.id)}
            className={`flex h-12 items-center gap-2 rounded border px-2 text-left text-sm ${
              onAir
                ? 'border-red-500 bg-red-900/60 font-bold'
                : 'border-neutral-600 bg-neutral-800 hover:bg-neutral-700'
            }`}
          >
            <kbd className="rounded bg-neutral-950 px-1.5 text-xs text-neutral-300">
              {SWITCHER_KEYS[index]}
            </kbd>
            <span className="flex-1">{camera.label}</span>
            {onAir && <span className="text-xs text-red-300">ON AIR</span>}
          </button>
        )
      })}
    </section>
  )
}

interface EventLogProps {
  log: readonly LogLine[]
  /** 자동 슬로모션 계기 이벤트. 그 줄을 강조한다. */
  highlightedEventId: number | null
}

export function EventLog({ log, highlightedEventId }: EventLogProps) {
  const recent = log.slice(-LOG_LINES_SHOWN)
  return (
    <section
      data-testid="event-log"
      className="min-w-0 flex-1 overflow-hidden rounded border border-neutral-700 bg-neutral-900 px-3 py-1"
    >
      <div className="text-xs text-neutral-400">사고 로그</div>
      {recent.length === 0 && <div className="text-sm text-neutral-500">아직 아무 일도 없습니다.</div>}
      <ol className="text-[13px] leading-[18px]">
        {recent.map((line) => (
          <li
            key={line.index}
            className={`flex ${
              line.eventId !== null && line.eventId === highlightedEventId
                ? 'bg-amber-500/30 text-amber-100'
                : ''
            }`}
          >
            {/* 시각은 고정 칸, 문장만 연쇄 깊이만큼 들여쓴다 */}
            <span className="w-10 shrink-0 tabular-nums text-neutral-500">
              {formatStepTime(line.step)}
            </span>
            <span
              className="min-w-0 truncate"
              style={{ paddingLeft: `${(line.depth - 1) * LOG_INDENT_PX}px` }}
            >
              {line.depth > 1 && <span className="text-neutral-500">└ </span>}
              {line.text}
              {line.depth > 1 && (
                <span className="ml-1 text-xs text-amber-400">연쇄 {line.depth}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
