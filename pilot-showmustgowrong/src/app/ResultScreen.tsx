import { GAUGE_LABELS, formatStepTime, formatViewers } from './labels'
import type { BroadcastResult } from './useBroadcastLoop'

interface ResultScreenProps {
  result: BroadcastResult
  onRestart(): void
}

/** 화면 표시 상수(게임 수치가 아니다). 결과 상자(높이 680px) 안에 연쇄가 다 들어가게 한다. */
export const CHAIN_INDENT_PX = 20
/** 이 단계보다 깊으면 더 들여쓰지 않는다. */
export const CHAIN_INDENT_MAX_LEVEL = 8
/** 이보다 긴 연쇄는 앞부분만 보이고 나머지를 "… 외 N단계"로 줄인다. */
export const CHAIN_LINES_SHOWN = 10

export function ResultScreen({ result, onRestart }: ResultScreenProps) {
  const { summary, longestChain, haltedBy, interventionsIssued } = result
  const shownChain = longestChain.slice(0, CHAIN_LINES_SHOWN)
  const hiddenCount = longestChain.length - shownChain.length
  return (
    <main
      data-testid="result-screen"
      className="flex h-screen items-center justify-center overflow-hidden bg-neutral-950 text-white"
    >
      <div className="flex max-h-[680px] w-[760px] flex-col gap-4 rounded border border-neutral-700 bg-neutral-900 p-6">
        <h1
          data-testid="result-title"
          className={`text-3xl font-bold ${haltedBy === null ? 'text-amber-300' : 'text-red-400'}`}
        >
          {haltedBy === null ? '방송 완료' : `방송 중단(${GAUGE_LABELS[haltedBy]} 게이지)`}
        </h1>
        <dl className="grid grid-cols-4 gap-3 text-center">
          <Stat label="최고 시청자" value={formatViewers(summary.peakViewers)} />
          <Stat label="평균 시청자" value={formatViewers(summary.averageViewers)} />
          <Stat label="최대 연쇄 깊이" value={`${summary.maxChainDepth}단계`} />
          <Stat label="개입" value={`${interventionsIssued}회`} />
        </dl>
        <section className="min-h-0 overflow-hidden">
          <h2 className="mb-2 text-sm text-neutral-400">가장 긴 연쇄</h2>
          {longestChain.length === 0 ? (
            <p className="text-neutral-500">이어진 사고가 없었습니다.</p>
          ) : (
            <ol data-testid="result-chain" className="space-y-1">
              {shownChain.map((line, index) => (
                <li key={`${line.step}:${index}`} className="flex">
                  <span className="w-12 shrink-0 text-sm tabular-nums text-neutral-500">
                    {formatStepTime(line.step)}
                  </span>
                  <span
                    className="min-w-0 truncate"
                    title={line.text}
                    style={{
                      paddingLeft: `${Math.min(index, CHAIN_INDENT_MAX_LEVEL) * CHAIN_INDENT_PX}px`,
                    }}
                  >
                    {index > 0 && <span className="text-neutral-500">└ </span>}
                    {line.text}
                  </span>
                </li>
              ))}
              {hiddenCount > 0 && (
                <li data-testid="result-chain-hidden" className="pl-12 text-sm text-neutral-500">
                  {`… 외 ${hiddenCount}단계`}
                </li>
              )}
            </ol>
          )}
        </section>
        <button
          type="button"
          data-testid="restart-button"
          onClick={onRestart}
          className="self-center rounded bg-red-600 px-6 py-2 font-bold hover:bg-red-500"
        >
          다시 하기
        </button>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-neutral-800 p-2">
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  )
}
