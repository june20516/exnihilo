import type { InterventionStep } from '@/game/content/encounters'
import { describeIntent, ROLE_NAMES } from './describe'
import { Icon } from './Icon'

export function IntentBadge({ steps }: { steps: readonly InterventionStep[] }) {
  return (
    <div
      data-testid="intent"
      className="flex animate-pulse items-center gap-2 rounded-lg bg-surface-container-high/95 px-4 py-2 shadow-xl backdrop-blur"
    >
      <Icon name="replay" className="text-[18px] text-error" />
      <div className="flex flex-col">
        <span className="font-label text-[10px] font-bold uppercase tracking-widest text-error">흉조 · 다음 개입</span>
        {steps.map((step, i) => (
          <span key={i} className="text-sm font-semibold text-on-surface">
            {steps.length > 1 ? `${i + 1}. ` : ''}
            {describeIntent(step, (r) => ROLE_NAMES[r])}
          </span>
        ))}
      </div>
    </div>
  )
}
