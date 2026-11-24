import type { ReactNode } from 'react'
import type { Amplifier } from '@/game/rally/summary'
import { Icon } from './Icon'
import { ICONS } from './icons'

interface ResourcePanelProps {
  amplifiers: readonly Amplifier[]
  drawPile: readonly { readonly text: string; readonly count: number }[]
  discardPile: readonly string[]
  emptyDrawHpLoss: number
}

/** 서랍 한 줄: 왼쪽 아이콘 칸, 오른쪽 제목과 내용. */
function Row({ icon, tone = 'text-on-surface', title, children }: { icon: string; tone?: string; title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest">
        <Icon name={icon} className={`text-[18px] ${tone}`} />
      </span>
      <div className="min-w-0 flex-1">
        <b className="font-ui text-[15px]">{title}</b>
        <div className="mt-1 font-ui text-[13px] leading-relaxed text-outline">{children}</div>
      </div>
    </div>
  )
}

function WordChip({ text, count }: { text: string; count?: number }) {
  return (
    <span className="mb-1 mr-1 inline-block rounded-md bg-surface-container-highest px-1.5 py-0.5 font-card text-sm text-on-surface">
      {text}
      {count !== undefined && <b className="ml-1 font-number font-normal">×{count}</b>}
    </span>
  )
}

/** 왼쪽 서랍: 적용 중인 증폭 요소, 서고(단어별 장수), 망각(들어간 순서), 서고 바닥 규칙. */
export function ResourcePanel({ amplifiers, drawPile, discardPile, emptyDrawHpLoss }: ResourcePanelProps) {
  const drawCount = drawPile.reduce((sum, d) => sum + d.count, 0)
  return (
    <>
      <Row icon={ICONS.relic} tone="text-secondary" title="적용 중">
        {amplifiers.length === 0
          ? '유물·구조·강화·상태 없음'
          : amplifiers.map((a, i) => (
              <span key={`${a.kind}-${a.name}-${i}`} className="flex items-center gap-1">
                <Icon name={ICONS[a.kind]} className="text-[14px] text-secondary" />
                <b className="text-on-surface">{a.name}</b> {a.text}
              </span>
            ))}
      </Row>
      <Row icon={ICONS.draw} title={<>서고 <span className="font-number font-normal">{drawCount}</span> <span className="text-xs font-normal text-outline">순서는 모름</span></>}>
        {drawPile.length === 0 ? '비어 있음' : drawPile.map((d) => <WordChip key={d.text} text={d.text} count={d.count} />)}
      </Row>
      <Row icon={ICONS.discardPile} title={<>망각 <span className="font-number font-normal">{discardPile.length}</span></>}>
        {discardPile.length === 0 ? '비어 있음 · 저절로 돌아오지 않음' : discardPile.map((text, i) => <WordChip key={`${text}-${i}`} text={text} />)}
      </Row>
      <Row icon="warning" tone="text-error" title="서고가 비면">
        못 뽑은 장수마다 <Icon name="favorite" className="text-[13px] text-primary" /> −{emptyDrawHpLoss}
      </Row>
    </>
  )
}
