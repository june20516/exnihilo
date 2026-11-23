import type { InterventionStep } from '@/game/content/encounters'
import type { PreviewLine } from '@/game/combat/preview'
import { describeIntent, ROLE_NAMES } from './describe'
import { Icon } from './Icon'

interface SidePanelProps {
  intents: readonly InterventionStep[]
  /** 낭독 모드에서 적이 낭독하기까지 남은 턴. 자동 모드는 null. */
  enemyCastIn: number | null
  preview: readonly PreviewLine[]
  previewTitle: string
}

const TONE_CLASS: Record<PreviewLine['tone'], string> = {
  harm: 'text-error',
  help: 'text-tertiary',
  neutral: 'text-on-surface-variant',
}

export function SidePanel({ intents, enemyCastIn, preview, previewTitle }: SidePanelProps) {
  return (
    <aside className="flex min-h-0 flex-col gap-3">
      <div data-testid="intent" className="rounded-lg bg-surface-container-high p-3 shadow-lg">
        <div className="mb-1 flex items-center gap-1 font-label text-[11px] font-bold uppercase tracking-widest text-error">
          <Icon name="replay" className="text-[14px]" />
          흉조 · 이번 턴 끝의 적 개입
        </div>
        {intents.map((step, i) => (
          <div key={i} className="text-sm font-semibold">
            {intents.length > 1 ? `${i + 1}. ` : ''}
            {describeIntent(step, (r) => ROLE_NAMES[r])}
          </div>
        ))}
        {enemyCastIn !== null && (
          <div data-testid="enemy-cast" className="mt-2 text-sm font-bold text-secondary">
            {enemyCastIn === 1 ? '⚠ 이번 턴 끝에 적이 문장을 낭독합니다' : `적의 낭독까지 ${enemyCastIn}턴`}
          </div>
        )}
      </div>
      <div
        data-testid="preview"
        className="flex min-h-0 flex-1 flex-col rounded-lg bg-surface-container p-3 shadow-inner"
      >
        <div className="mb-1 font-label text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
          {previewTitle}
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto text-sm">
          {preview.length === 0 && <li className="text-outline">아무 일도 일어나지 않는다</li>}
          {preview.map((line, i) => (
            <li key={i} className={TONE_CLASS[line.tone]}>
              {line.text}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
