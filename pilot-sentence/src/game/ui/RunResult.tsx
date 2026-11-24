import { FLOORS } from '@/game/run/floors'
import { offerName } from '@/game/run/labels'
import type { RunState } from '@/game/run/run'
import { BuildSummary } from './BuildSummary'

/** 런 결과: 완주 또는 패배, 도달 층, 최대 한 방, 산 것. */
export function RunResult({ state, onNewRun }: { state: RunState; onNewRun: () => void }) {
  const won = state.phase === 'won'
  const bought = state.log.purchases.map((o) => offerName(o, state.build))
  return (
    <main className="flex min-h-0 flex-col items-center gap-4 overflow-hidden p-6" data-testid="run-result">
      <span className={`font-prose text-5xl font-black ${won ? 'text-secondary' : 'text-error'}`}>{won ? '완주' : '패배'}</span>
      <p className="text-on-surface-variant">
        도달 {state.floor}/{FLOORS.length}층 · 최대 한 방 <span data-testid="best-burst" className="font-bold text-secondary">{state.log.bestBurst}</span>
      </p>
      <p className="max-w-4xl text-center text-sm text-on-surface-variant">산 것: {bought.length > 0 ? bought.join(', ') : '없음'}</p>
      <div className="w-full max-w-5xl">
        <BuildSummary build={state.build} deck={state.deck} />
      </div>
      <button
        type="button"
        onClick={onNewRun}
        className="rounded-xl bg-primary-container px-6 py-3 font-ui text-xl font-bold text-on-primary-container"
      >
        새 런
      </button>
    </main>
  )
}
