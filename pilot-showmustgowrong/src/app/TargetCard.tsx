import type { ReactNode, Ref } from 'react'
import type { BroadcastInput } from '@/sim/engine'
import type { TargetOption } from './interventionTargets'
import { WEIGHT_LABELS, formatPercent } from './labels'

interface TargetCardProps {
  option: TargetOption
  onDirect(input: BroadcastInput): void
  /** 스튜디오의 대상과 잇는 선의 시작점을 재는 데 쓴다. */
  cardRef?: Ref<HTMLElement>
}

function toleranceText(left: number): string {
  return left === 0 ? '남은 내성 0 · 다음 지시에 이탈' : `남은 내성 ${left}`
}

/**
 * 판단 카드(spec 8.2 3단계). 이름과 역할, 스탯, 성향 한 줄, 엇나감 확률(대상 단위로 한 번),
 * 지시와 각각의 예상 결과, 지시 한 번의 소모 비용.
 */
export function TargetCard({ option, onDirect, cardRef }: TargetCardProps) {
  return (
    <section
      ref={cardRef}
      data-testid="target-card"
      className="flex flex-col gap-2 rounded-xl border-[3px] border-amber-300 bg-slate-900 p-2.5 shadow-[4px_4px_0_#000]"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-black text-slate-50">{option.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
            {option.presence !== null && <StatChip>존재감 {option.presence}</StatChip>}
            {option.toleranceLeft !== null && (
              <StatChip warn={option.toleranceLeft === 0}>
                {toleranceText(option.toleranceLeft)}
              </StatChip>
            )}
            {option.weight !== null && <StatChip>체급 {WEIGHT_LABELS[option.weight]}</StatChip>}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-black text-white">
          {option.role}
        </span>
      </header>
      <p className="rounded-lg border-2 border-red-800 bg-red-950/60 px-2 py-1 text-xs leading-4 text-red-100">
        {option.tendency}
      </p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">지시하면 엇나갈 확률</span>
        <span data-testid="misfire-chance" className="text-base font-black text-amber-300">
          {formatPercent(option.misfireChance)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {option.directives.map((directive, index) => (
          <button
            key={directive.id}
            type="button"
            data-testid={`directive-${directive.id}`}
            onClick={() => onDirect(directive.input)}
            className="rounded-lg border-2 border-slate-600 bg-slate-800 px-2 py-1.5 text-left shadow-[0_3px_0_#020617] hover:border-amber-300 active:translate-y-0.5 active:shadow-none"
          >
            <div className="text-sm font-bold text-slate-50">
              {index + 1}. “{directive.label}”
            </div>
            <div className="text-xs text-sky-300">→ {directive.expect}</div>
          </button>
        ))}
      </div>
      <footer className="border-t border-slate-700 pt-1.5 text-xs font-bold text-amber-200">
        비용: {option.cost}
      </footer>
    </section>
  )
}

function StatChip({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-px ${warn ? 'bg-red-700 text-white' : 'bg-slate-800 text-slate-300'}`}
    >
      {children}
    </span>
  )
}
