import type { ReactNode, Ref } from 'react'
import type { BroadcastInput } from '@/sim/engine'
import type { TargetOption } from './interventionTargets'
import { EmotionBar } from './ActorInfoCard'
import { isCommon } from './emotionDisplay'
import { WEIGHT_LABELS, formatPercent } from './labels'

/** 스태프처럼 출연자 색이 없는 대상의 카드 테두리색 */
const NEUTRAL_BORDER = '#FCD34D'

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
 * 판단 카드(spec Plan B2 7절). 머리(이름·역할·대표 감정·작은 감정 막대·엇나감 확률·이어받기), 지시 카드마다
 * 번호·이름·예상 결과·감정 변화 칩, 아래에 남은 내성과 소모 비용. 마음이 없거나 스태프면 감정 칸 없이 지시만 보인다.
 * 칸(260px)보다 길면 카드 안에서 스크롤한다.
 */
export function TargetCard({ option, onDirect, cardRef }: TargetCardProps) {
  return (
    <section
      ref={cardRef}
      data-testid="target-card"
      className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-xl border-[3px] bg-slate-900 p-2.5 shadow-[4px_4px_0_#000]"
      style={{ borderColor: option.color ?? NEUTRAL_BORDER }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-black text-slate-50">{option.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
            {option.cameraLabel !== null && <StatChip>담당 {option.cameraLabel}</StatChip>}
            {option.presence !== null && <StatChip>존재감 {option.presence}</StatChip>}
            {option.toleranceLeft !== null && (
              <StatChip warn={option.toleranceLeft === 0}>
                {toleranceText(option.toleranceLeft)}
              </StatChip>
            )}
            {option.weight !== null && <StatChip>체급 {WEIGHT_LABELS[option.weight]}</StatChip>}
          </div>
        </div>
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-black text-slate-950"
          style={{ backgroundColor: option.color ?? NEUTRAL_BORDER }}
        >
          {option.role}
        </span>
      </header>
      {option.moodText !== null && (
        <div data-testid="target-mood" className="truncate text-xs text-slate-300">
          {option.moodText}
        </div>
      )}
      {option.emotions.length > 0 && <EmotionBars option={option} />}
      {option.takeoverText !== null && (
        <div data-testid="target-takeover" className="text-[11px] text-sky-300">
          ↪ {option.takeoverText}
        </div>
      )}
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
            {directive.shifts.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {directive.shifts.map((shift) => (
                  <span
                    key={shift.text}
                    data-testid="directive-chip"
                    data-rising={shift.rising}
                    className="rounded-full border px-1.5 py-px text-[11px] font-bold"
                    style={{ color: shift.color, borderColor: shift.color }}
                  >
                    {shift.text}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
      <footer className="border-t border-slate-700 pt-1.5 text-xs font-bold text-amber-200">
        비용: {option.cost}
      </footer>
    </section>
  )
}

/** 정보 카드와 같은 감정 막대: 공용 4개 아래 구분선, 그 아래 개인 감정 */
function EmotionBars({ option }: { option: TargetOption }) {
  const common = option.emotions.filter(isCommon)
  const personal = option.emotions.filter((emotion) => !isCommon(emotion))
  return (
    <div className="flex flex-col gap-1">
      {common.map((emotion) => (
        <EmotionBar key={emotion.id} emotion={emotion} personal={false} />
      ))}
      {personal.length > 0 && <hr className="my-0.5 border-slate-700" />}
      {personal.map((emotion) => (
        <EmotionBar key={emotion.id} emotion={emotion} personal />
      ))}
    </div>
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
