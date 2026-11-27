import { BROADCAST_STEPS } from '@/content/balance'
import type { PerformerDef, ShowDef } from '@/content/types'
import type { ChainLine } from '@/sim/engineTypes'
import { GAUGE_LABELS, formatShowClock, formatShowEnd, formatViewers } from './labels'
import { TrendChart } from './TrendChart'
import type { TrendSeries } from './trendRecorder'
import type { BroadcastResult } from './useBroadcastLoop'

interface ResultScreenProps {
  result: BroadcastResult
  /** 방송 전체의 근접도 기록(정산의 전체 추세 그래프가 쓴다) */
  trend: readonly TrendSeries[]
  show: ShowDef
  /** 무대와 대기석의 모든 출연자(연쇄 점 색과 추세 범례에 쓴다) */
  performers: readonly PerformerDef[]
  onRestart(): void
}

/** 주인공이 출연자가 아닌 줄(장비·관객 등)의 점 색 */
const NON_PERFORMER_COLOR = '#94A3B8'

export function ResultScreen({ result, trend, show, performers, onRestart }: ResultScreenProps) {
  const { summary, longestChain, haltedBy, interventionsIssued } = result
  const colors = Object.fromEntries(performers.map((performer) => [performer.id, performer.color]))
  const names = Object.fromEntries(performers.map((performer) => [performer.id, performer.shortName]))
  return (
    <main
      data-testid="result-screen"
      className="flex h-screen items-center justify-center overflow-hidden bg-slate-950 text-white"
    >
      <div className="flex h-[680px] w-[1200px] flex-col gap-3">
        <header className="flex items-center gap-4">
          <h1
            data-testid="result-title"
            className={`text-3xl font-bold ${haltedBy === null ? 'text-amber-300' : 'text-red-400'}`}
          >
            {haltedBy === null ? '방송 완료' : `방송 중단(${GAUGE_LABELS[haltedBy]} 게이지)`}
          </h1>
          {haltedBy === null && (
            <span
              data-testid="result-end-stamp"
              className="-rotate-2 rounded bg-red-800 px-2 py-0.5 text-sm font-bold tabular-nums"
            >
              {`${formatShowEnd(show)} 종료`}
            </span>
          )}
        </header>
        <RootCard rootLine={summary.rootLine} show={show} />
        <dl data-testid="result-stats" className="grid grid-cols-4 gap-3">
          <Stat label="최고 시청자" value={formatViewers(summary.peakViewers)} />
          <Stat label="평균 시청자" value={formatViewers(summary.averageViewers)} />
          <Stat label="최대 연쇄 깊이" value={`${summary.maxChainDepth}단계`} />
          <Stat label="개입" value={`${interventionsIssued}회`} />
        </dl>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
          <ChainPanel chain={longestChain} colors={colors} show={show} />
          <section className="flex min-h-0 flex-col rounded-xl border-2 border-slate-800 bg-slate-900/60 p-4">
            <h2 className="mb-2 text-lg font-bold text-slate-300">터짐 추세</h2>
            <div className="min-h-0 flex-1 [&>svg]:h-auto [&>svg]:w-full">
              <TrendChart
                series={trend}
                colors={colors}
                names={names}
                fromStep={0}
                toStep={BROADCAST_STEPS}
                axis="clock"
                show={show}
              />
            </div>
          </section>
        </div>
        <button
          type="button"
          data-testid="restart-button"
          onClick={onRestart}
          className="self-center rounded-lg bg-red-500 px-8 py-2 text-xl font-bold hover:bg-red-400"
        >
          다시 하기
        </button>
      </div>
    </main>
  )
}

/** 이 방송을 망친 첫 사고. 화면에서 가장 큰 글자다. 사고 연쇄가 없었으면 작게 안내한다 */
function RootCard({ rootLine, show }: { rootLine: BroadcastResult['summary']['rootLine']; show: ShowDef }) {
  if (rootLine === null) {
    return (
      <p
        data-testid="result-calm"
        className="rounded-xl border-2 border-slate-800 bg-slate-900/60 px-4 py-3 text-base text-slate-400"
      >
        큰 사고 없이 끝났다
      </p>
    )
  }
  return (
    <section
      data-testid="result-root"
      className="rounded-xl border-2 border-slate-800 bg-slate-900/60 px-4 py-3"
    >
      <p className="text-sm font-bold text-red-300">모든 건 여기서 시작됐다</p>
      <p
        data-testid="result-root-sentence"
        title={rootLine.text}
        className="truncate text-5xl font-bold text-amber-200"
      >
        {`${formatShowClock(rootLine.step, show)} ${rootLine.text}`}
      </p>
    </section>
  )
}

/** 가장 긴 연쇄. 줄은 화살표로 잇고, 길면 칸 안에서 스크롤한다 */
function ChainPanel({
  chain,
  colors,
  show,
}: {
  chain: readonly ChainLine[]
  colors: Readonly<Record<string, string>>
  show: ShowDef
}) {
  const lastIndex = chain.length - 1
  return (
    <section className="flex min-h-0 flex-col rounded-xl border-2 border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-2 text-lg font-bold text-slate-300">가장 긴 연쇄</h2>
      {chain.length === 0 ? (
        <p data-testid="result-chain-empty" className="text-base text-slate-500">
          연쇄 없음
        </p>
      ) : (
        <ol data-testid="result-chain" className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
          {chain.map((line, index) => (
            <li key={`${line.step}:${index}`} className="flex flex-col items-stretch">
              {index > 0 && (
                <span data-testid="result-chain-arrow" className="py-0.5 text-center text-sm text-slate-500">
                  ↓
                </span>
              )}
              <div
                data-testid="result-chain-line"
                className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2"
              >
                <span
                  data-testid="result-chain-dot"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: (line.actorId !== null && colors[line.actorId]) || NON_PERFORMER_COLOR }}
                />
                <span className="w-12 shrink-0 text-sm tabular-nums text-slate-400">
                  {formatShowClock(line.step, show)}
                </span>
                <span
                  data-testid="result-chain-text"
                  title={line.text}
                  className="min-w-0 flex-1 truncate text-base"
                >
                  {line.text}
                </span>
                {index === 0 && <ChainBadge label="뿌리" />}
                {index === lastIndex && <ChainBadge label="가장 큰 터짐" />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function ChainBadge({ label }: { label: string }) {
  return <span className="shrink-0 rounded bg-red-500 px-2 py-0.5 text-xs font-bold">{label}</span>
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-slate-800 bg-slate-900/60 px-4 py-2">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  )
}
