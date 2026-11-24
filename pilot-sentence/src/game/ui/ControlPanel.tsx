import { Tooltip } from './Tooltip'
import { Icon } from './Icon'

interface ControlPanelProps {
  /** 서고: 단어별 장수(순서는 감춘다). */
  drawPile: readonly { readonly text: string; readonly count: number }[]
  /** 망각: 들어간 순서대로의 단어 문구. */
  discardPile: readonly string[]
  /** 서고가 바닥났을 때 못 뽑은 장수당 잃는 HP(규칙 값). */
  emptyDrawHpLoss: number
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
  const { drawPile, discardPile, emptyDrawHpLoss, turn, discardsLeft, markedCount, disabled, onToggleDiscard, onConfirmDiscard } = props
  const discarding = markedCount !== null
  const drawCount = drawPile.reduce((sum, d) => sum + d.count, 0)
  return (
    <div className="flex w-56 shrink-0 flex-col gap-2">
      <div className="flex justify-between rounded-xl bg-surface-container px-3 py-2 font-ui text-xs text-on-surface-variant shadow-lg">
        <Tooltip
          testId="pile-draw"
          content={
            <>
              <b>서고</b> — 앞으로 뽑을 카드(순서는 모름)
              <br />
              {drawPile.length > 0
                ? drawPile.map((d) => `${d.text} ×${d.count}`).join(', ')
                : `비어 있음: 뽑아야 할 때 못 뽑은 장수마다 HP ${emptyDrawHpLoss}를 잃습니다.`}
            </>
          }
        >
          <span>서고 {drawCount}</span>
        </Tooltip>
        <Tooltip
          testId="pile-discard"
          content={
            <>
              <b>망각</b> — 쓰거나 버린 카드(들어간 순서). 저절로 서고로 돌아오지 않습니다.
              <br />
              {discardPile.length > 0 ? discardPile.join(' → ') : '비어 있음'}
            </>
          }
        >
          <span data-testid="discard-pile">망각 {discardPile.length}</span>
        </Tooltip>
        <span data-testid="turn">턴 {turn}</span>
      </div>
      <div className="flex gap-2">
      <button
        type="button"
        data-testid="discard"
        disabled={disabled || discardsLeft <= 0}
        onClick={onToggleDiscard}
        className={`flex min-h-[60px] flex-1 items-center justify-between rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-40 ${
          discarding ? 'bg-error-container text-on-error-container' : 'bg-surface-container-high'
        }`}
      >
        <span className="flex items-center gap-1">
          <Icon name="delete_sweep" className="text-[18px]" />
          {discarding ? '버리기 취소' : '버리고 새로 뽑기'}
        </span>
        {!discarding && <span className="font-ui text-xs text-secondary">턴당 {discardsLeft}회</span>}
      </button>
      {discarding && (
        <button
          type="button"
          data-testid="discard-confirm"
          disabled={disabled || markedCount === 0}
          onClick={onConfirmDiscard}
          className="min-h-[60px] w-20 rounded-lg bg-error px-2 py-2 text-sm font-bold text-on-error disabled:opacity-40"
        >
          {markedCount}장 버리기
        </button>
      )}
      </div>
    </div>
  )
}
