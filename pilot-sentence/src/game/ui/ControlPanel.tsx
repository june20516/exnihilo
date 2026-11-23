import type { RuleConfig } from '@/game/content/rules'
import { Icon } from './Icon'

const RESOURCE_NAMES = { fixed: '행동력', ramp: '마나', ink: '잉크' } as const

function maxResource(rules: RuleConfig): number {
  const r = rules.resource
  return r.mode === 'fixed' ? r.perTurn : r.max
}

interface ControlPanelProps {
  rules: RuleConfig
  resource: number
  swapsLeft: number
  drawCount: number
  discardCount: number
  turn: number
  disabled: boolean
  onSwap: () => void
  onDrawPaid: () => void
}

/** 왼쪽 아래: 자원, 덱 상태, 기본 행동(뒤바꾸기, 추가 드로우). */
export function ControlPanel(props: ControlPanelProps) {
  const { rules, resource, swapsLeft, drawCount, discardCount, turn, disabled, onSwap, onDrawPaid } = props
  const max = maxResource(rules)
  const canSwap = !disabled && swapsLeft > 0 && resource >= rules.swapCost
  const canDraw =
    !disabled && rules.paidDrawCost !== null && resource >= rules.paidDrawCost && drawCount + discardCount > 0
  return (
    <div className="flex w-56 shrink-0 flex-col gap-2">
      <div className="rounded-xl bg-surface-container px-3 py-2 shadow-lg" data-testid="resource">
        <div className="flex items-baseline justify-between">
          <span className="font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
            {RESOURCE_NAMES[rules.resource.mode]}
          </span>
          <span className="font-headline text-xl font-bold text-secondary">
            {resource} / {max}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={`h-4 w-3 rounded-full ${i < resource ? 'bg-secondary' : 'bg-surface-container-highest'}`}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        data-testid="swap"
        disabled={!canSwap}
        onClick={onSwap}
        className="flex items-center justify-between rounded-lg bg-surface-container-high px-3 py-2 text-sm font-bold disabled:opacity-40"
      >
        <span className="flex items-center gap-1">
          <Icon name="swap_horiz" className="text-[18px]" />
          주어 ↔ 목적어
        </span>
        <span className="font-label text-xs text-secondary">
          {rules.swapCost} · 턴당 {rules.swapsPerTurn}회
        </span>
      </button>
      {rules.paidDrawCost !== null && (
        <button
          type="button"
          data-testid="draw-paid"
          disabled={!canDraw}
          onClick={onDrawPaid}
          className="flex items-center justify-between rounded-lg bg-surface-container-high px-3 py-2 text-sm font-bold disabled:opacity-40"
        >
          <span className="flex items-center gap-1">
            <Icon name="add_card" className="text-[18px]" />한 장 더 뽑기
          </span>
          <span className="font-label text-xs text-secondary">{rules.paidDrawCost}</span>
        </button>
      )}
      <div className="flex justify-between font-label text-xs text-on-surface-variant">
        <span>서고 {drawCount}</span>
        <span data-testid="discard">망각 {discardCount}</span>
        <span>턴 {turn}</span>
      </div>
    </div>
  )
}
