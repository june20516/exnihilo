import type { Ref } from 'react'
import type { CameraDef, PerformerDef, StaffDef } from '@/content/types'
import type { BroadcastInput, BroadcastView } from '@/sim/engine'
import { interventionTargets, type InterventionTarget } from './interventionTargets'
import { TargetCard } from './TargetCard'

interface InterventionPanelProps {
  view: BroadcastView
  performers: ReadonlyMap<string, PerformerDef>
  staff: readonly StaffDef[]
  cameras: readonly CameraDef[]
  selected: InterventionTarget | null
  onSelect(target: InterventionTarget): void
  onDirect(input: BroadcastInput): void
  onClose(): void
  cardRef?: Ref<HTMLElement>
}

/**
 * 개입 중 왼쪽 칸(추세 그래프와 로그 자리)을 덮는 판단 카드. 위에 대상 탭(출연자 색 글자), 대상을 고르면
 * 그 아래에 판단 카드. 남은 선택 시간은 스튜디오 위 SLOW 배지에 크게 보인다.
 */
export function InterventionPanel({
  view,
  performers,
  staff,
  cameras,
  selected,
  onSelect,
  onDirect,
  onClose,
  cardRef,
}: InterventionPanelProps) {
  const options = interventionTargets(view, performers, staff, cameras)
  const current = options.find(
    (option) => option.target.kind === selected?.kind && option.target.id === selected.id,
  )
  return (
    <section data-testid="intervention-panel" className="flex min-h-0 flex-1 flex-col gap-2">
      <header className="flex items-center justify-between">
        <span className="text-sm font-black text-red-300">개입 · 누구에게?</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-white"
        >
          닫기 (Esc)
        </button>
      </header>
      <ul className="flex flex-wrap gap-1">
        {options.map((option) => {
          const isSelected = option === current
          return (
            <li key={`${option.target.kind}:${option.target.id}`}>
              <button
                type="button"
                data-testid={`target-${option.target.id}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(option.target)}
                style={{
                  color: option.color ?? '#E2E8F0',
                  borderColor: isSelected ? (option.color ?? '#FCD34D') : undefined,
                }}
                className={`rounded-md border-2 px-2 py-0.5 text-xs font-black ${
                  isSelected
                    ? 'bg-slate-950'
                    : 'border-slate-600 bg-slate-800 hover:border-amber-300'
                }`}
              >
                {option.shortName}
                {option.toleranceLeft !== null && (
                  <span className="ml-1 font-normal opacity-80">내성 {option.toleranceLeft}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {current === undefined ? (
        <p className="rounded-lg border-2 border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-400">
          스튜디오의 출연자나 카메라 감독을 누르거나 위에서 고르면 대상 카드가 열립니다.
        </p>
      ) : (
        <TargetCard option={current} onDirect={onDirect} cardRef={cardRef} />
      )}
    </section>
  )
}
