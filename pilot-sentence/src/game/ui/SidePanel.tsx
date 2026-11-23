import type { PreviewLine } from '@/game/rally/lines'

interface SidePanelProps {
  mine: readonly PreviewLine[]
  enemy: readonly PreviewLine[]
  /** 동사가 없어 낭독할 수 없으면 false: 첫 목록에 안내를 보여 준다. */
  canCast: boolean
}

const TONE_CLASS: Record<PreviewLine['tone'], string> = {
  harm: 'text-error',
  help: 'text-tertiary',
  neutral: 'text-on-surface-variant',
}

function PreviewList({ testId, title, lines, empty }: { testId: string; title: string; lines: readonly PreviewLine[]; empty: string }) {
  return (
    <div data-testid={testId} className="flex min-h-0 flex-1 flex-col rounded-lg bg-surface-container p-3 shadow-inner">
      <div className="mb-1 font-label text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">{title}</div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto text-sm">
        {lines.length === 0 && <li className="text-outline">{empty}</li>}
        {lines.map((line, i) => (
          <li key={i} className={TONE_CLASS[line.tone]}>
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 오른쪽: 이번 라운드에 일어날 일(실제 엔진으로 미리 계산). */
export function SidePanel({ mine, enemy, canCast }: SidePanelProps) {
  return (
    <aside className="flex min-h-0 flex-col gap-2">
      <PreviewList
        testId="preview-mine"
        title="낭독하면"
        lines={mine}
        empty={canCast ? '아무 일도 일어나지 않는다' : '동사가 없어 낭독할 수 없다'}
      />
      <PreviewList testId="preview-enemy" title="이어서 적의 차례" lines={enemy} empty="적이 아무것도 하지 않는다" />
    </aside>
  )
}
