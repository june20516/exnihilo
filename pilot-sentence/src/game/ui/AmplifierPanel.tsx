import type { Amplifier } from '@/game/rally/summary'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { Tooltip } from './Tooltip'

/** 적용 중인 증폭 요소(유물·늘어난 구조·강화·내 상태). 늘 보이는 작은 패널이고, 자세한 효과는 툴팁으로. */
export function AmplifierPanel({ items }: { items: readonly Amplifier[] }) {
  return (
    <div data-testid="amplifiers" className="flex flex-col gap-1 rounded-xl bg-surface-container px-3 py-2 font-ui text-xs shadow-lg">
      <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">적용 중</span>
      {items.length === 0 ? (
        <span className="text-outline">없음</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((a, i) => (
            <Tooltip key={`${a.kind}-${a.name}-${i}`} content={<><b>{a.name}</b> — {a.text}</>}>
              <span className="flex items-center gap-0.5 rounded bg-surface-container-high px-1.5 py-0.5">
                <Icon name={ICONS[a.kind]} className="text-[12px] text-secondary" />
                {a.name}
              </span>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}
