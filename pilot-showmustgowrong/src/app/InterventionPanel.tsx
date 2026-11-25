import type { PerformerDef, StaffDef } from '@/content/types'
import type { BroadcastInput, BroadcastView } from '@/sim/engine'
import { interventionTargets, type InterventionTarget } from './interventionTargets'

interface InterventionPanelProps {
  view: BroadcastView
  performers: ReadonlyMap<string, PerformerDef>
  staff: readonly StaffDef[]
  selected: InterventionTarget | null
  secondsLeft: number
  onSelect(target: InterventionTarget): void
  onDirect(input: BroadcastInput): void
  onClose(): void
}

function toleranceText(directivesLeft: number): string {
  return directivesLeft === 0 ? '내성 0 · 한 번 더 지시하면 이탈' : `남은 내성 ${directivesLeft}`
}

export function InterventionPanel({
  view,
  performers,
  staff,
  selected,
  secondsLeft,
  onSelect,
  onDirect,
  onClose,
}: InterventionPanelProps) {
  const options = interventionTargets(view.actors, performers, staff)
  const current = options.find(
    (option) => option.target.kind === selected?.kind && option.target.id === selected.id,
  )
  return (
    <section
      data-testid="intervention-panel"
      className="flex flex-col gap-2 rounded border border-red-500 bg-red-950/40 p-3"
    >
      <header className="flex items-center justify-between">
        <span className="font-bold">개입 · 지시할 대상을 고르세요</span>
        <span data-testid="intervention-seconds" className="tabular-nums text-red-300">
          {secondsLeft.toFixed(1)}초
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {options.map((option) => {
          const isSelected = option === current
          return (
            <li key={`${option.target.kind}:${option.target.id}`}>
              <button
                type="button"
                data-testid={`target-${option.target.id}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(option.target)}
                className={`flex w-full items-baseline justify-between rounded px-2 py-1 text-left text-sm ${
                  isSelected ? 'bg-red-800' : 'bg-neutral-800 hover:bg-neutral-700'
                }`}
              >
                <span>{option.name}</span>
                <span className="text-xs text-neutral-300">
                  {option.directivesLeft === null ? '스태프' : toleranceText(option.directivesLeft)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {current === undefined ? (
        <p className="text-xs text-neutral-400">
          스튜디오의 출연자를 클릭하거나 목록에서 고르면 지시가 나옵니다.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {current.directives.map((directive) => (
            <button
              key={directive.id}
              type="button"
              data-testid={`directive-${directive.id}`}
              onClick={() => onDirect(directive.input)}
              className="rounded border border-amber-400 bg-amber-500/20 px-2 py-1.5 text-left text-sm hover:bg-amber-500/40"
            >
              “{directive.label}”
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="self-end text-xs text-neutral-400 hover:text-white"
      >
        닫기 (Esc)
      </button>
    </section>
  )
}
