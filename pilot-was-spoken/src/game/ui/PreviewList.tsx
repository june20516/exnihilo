import type { ChangeChip, ChangeChipKind, EntityChange } from '@/game/rally/summary'
import { Icon } from './Icon'
import { ICONS, TONES } from './icons'

const CHIP_LABELS: Readonly<Record<ChangeChipKind, string>> = {
  damage: '피해', blocked: '막음', heal: '회복', hpLoss: 'HP −', grow: '최대 HP +', block: '보호', poison: '독', weak: '약화',
  vulnerable: '취약', strength: '힘', freeze: '빙결', cleanse: '해로운 상태 제거', emptyDraw: '서고 바닥 HP −', summoned: '등장',
}

function chipText(chip: ChangeChip): string {
  const label = CHIP_LABELS[chip.kind]
  if (chip.kind === 'cleanse' || chip.kind === 'summoned' || chip.kind === 'freeze') return label
  const amount = label.endsWith('−') || label.endsWith('+') ? `${chip.amount}` : ` ${chip.amount}`
  const holds = chip.kind === 'block' && chip.holds ? ` · ${chip.holds}턴 유지` : ''
  return `${label}${amount}${holds}`
}

/** 미리보기 한 구간: 개체마다 한 줄(HP 전→후와 막대, 변화 칩). */
export function PreviewList({ testId, title, changes, empty }: { testId: string; title: string; changes: readonly EntityChange[]; empty: string }) {
  return (
    <div data-testid={testId} className="flex flex-col rounded-lg bg-surface-container p-3 shadow-inner">
      <div className="mb-1.5 font-ui text-xs font-bold uppercase tracking-widest text-on-surface-variant">{title}</div>
      <ul data-testid={`${testId}-list`} className="space-y-2">
        {changes.length === 0 && <li className="font-ui text-sm text-outline">{empty}</li>}
        {changes.map((c) => {
          const ratio = c.maxHp > 0 ? Math.max(0, c.hpAfter) / c.maxHp : 0
          return (
            <li key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-prose text-sm font-bold">{c.name}</span>
                <span className="font-number text-sm">
                  {c.hpBefore} → {c.hpAfter}
                  {c.died && <span className="ml-1 rounded bg-error-container px-1 font-ui text-[10px] text-on-error-container">처치</span>}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-container-high">
                <div className={`h-full ${c.side === 'enemy' ? 'bg-error' : 'bg-primary'}`} style={{ width: `${ratio * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-1 font-ui text-[11px]">
                {c.chips.map((chip, i) => (
                  <span key={i} className={`flex items-center gap-0.5 rounded bg-surface-container-high px-1 ${TONES[chip.kind] ?? ''}`}>
                    <Icon name={ICONS[chip.kind]} className="text-[12px]" />
                    {chipText(chip)}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
