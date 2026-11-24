import type { ReactNode } from 'react'
import { Icon } from './Icon'

interface ActionColumnProps {
  /** 행동할 수 있는가(내 차례이고 연출 중이 아님). */
  canAct: boolean
  /** 동사가 놓여 낭독할 수 있는가. */
  canCast: boolean
  sentenceEmpty: boolean
  discardsLeft: number
  /** 버리기 모드에서 표시한 카드 수. 버리기 모드가 아니면 null. */
  markedCount: number | null
  onCast: () => void
  onEndTurn: () => void
  onToggleDiscard: () => void
  onConfirmDiscard: () => void
  onClear: () => void
}

/** 버튼 높이는 기준 크기에서 60px 이상: 가장 작은 화면(비율 약 0.67)에서도 터치 대상 40px. */
function SmallButton(props: { testId: string; icon: string; label: ReactNode; title: string; disabled: boolean; onClick: () => void; tone: string }) {
  const { testId, icon, label, title, disabled, onClick, tone } = props
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 font-ui text-sm font-bold shadow-lg transition active:scale-95 disabled:opacity-40 ${tone}`}
    >
      <Icon name={icon} className="text-[22px]" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

/** 오른쪽 아래: 윗줄 낭독(버리기 모드면 확정 버튼이 옆에), 아랫줄 턴 종료·버리기·문장 비우기. */
export function ActionColumn(props: ActionColumnProps) {
  const { canAct, canCast, sentenceEmpty, discardsLeft, markedCount, onCast, onEndTurn, onToggleDiscard, onConfirmDiscard, onClear } = props
  const discarding = markedCount !== null
  return (
    <div className="flex w-64 shrink-0 flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="cast"
          disabled={!canAct || !canCast}
          onClick={onCast}
          className="flex h-16 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-secondary-container px-4 font-ui text-2xl font-black text-on-secondary-container shadow-xl transition active:scale-95 disabled:opacity-50"
        >
          <Icon name="campaign" className="text-[28px]" />
          낭독
        </button>
        {discarding && (
          <button
            type="button"
            data-testid="discard-confirm"
            disabled={!canAct || markedCount === 0}
            onClick={onConfirmDiscard}
            className="h-16 w-28 rounded-xl bg-error px-2 font-ui text-base font-bold text-on-error shadow-xl disabled:opacity-40"
          >
            {markedCount}장 버리기
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <SmallButton testId="end-turn" icon="skip_next" label="턴 종료" title="낭독 없이 넘긴다" disabled={!canAct} onClick={onEndTurn} tone="bg-primary-container text-on-primary-container" />
        <SmallButton
          testId="discard"
          icon="delete_sweep"
          label={discarding ? '취소' : <>버리기 <b className="font-number font-normal">{discardsLeft}</b></>}
          title={discarding ? '버리기 취소' : `손패를 골라 버리고 새로 뽑는다(턴당 ${discardsLeft}회 남음)`}
          disabled={!canAct || discardsLeft <= 0}
          onClick={onToggleDiscard}
          tone={discarding ? 'bg-error-container text-on-error-container' : 'bg-surface-container-high text-on-surface'}
        />
        <SmallButton testId="clear" icon="backspace" label="비우기" title="문장 비우기" disabled={!canAct || sentenceEmpty} onClick={onClear} tone="bg-surface-container-high text-on-surface" />
      </div>
    </div>
  )
}
