import { Icon } from './Icon'

interface ControlPanelProps {
  drawCount: number
  discardCount: number
  turn: number
  discardsLeft: number
  /** 버리기 모드에서 표시한 카드 수. 버리기 모드가 아니면 null. */
  markedCount: number | null
  disabled: boolean
  onToggleDiscard: () => void
  onConfirmDiscard: () => void
}

/** 왼쪽 아래: 덱 상태와 버리기. */
export function ControlPanel(props: ControlPanelProps) {
  const { drawCount, discardCount, turn, discardsLeft, markedCount, disabled, onToggleDiscard, onConfirmDiscard } = props
  const discarding = markedCount !== null
  return (
    <div className="flex w-56 shrink-0 flex-col gap-2">
      <div className="flex justify-between rounded-xl bg-surface-container px-3 py-2 font-label text-xs text-on-surface-variant shadow-lg">
        <span>서고 {drawCount}</span>
        <span data-testid="discard-pile">망각 {discardCount}</span>
        <span data-testid="turn">턴 {turn}</span>
      </div>
      <button
        type="button"
        data-testid="discard"
        disabled={disabled || discardsLeft <= 0}
        onClick={onToggleDiscard}
        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-40 ${
          discarding ? 'bg-error-container text-on-error-container' : 'bg-surface-container-high'
        }`}
      >
        <span className="flex items-center gap-1">
          <Icon name="delete_sweep" className="text-[18px]" />
          {discarding ? '버리기 취소' : '버리고 새로 뽑기'}
        </span>
        <span className="font-label text-xs text-secondary">턴당 {discardsLeft}회</span>
      </button>
      {discarding && (
        <button
          type="button"
          data-testid="discard-confirm"
          disabled={disabled || markedCount === 0}
          onClick={onConfirmDiscard}
          className="rounded-lg bg-error px-3 py-2 text-sm font-bold text-on-error disabled:opacity-40"
        >
          {markedCount}장 버리기
        </button>
      )}
    </div>
  )
}
