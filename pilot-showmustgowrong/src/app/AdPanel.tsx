import { useState } from 'react'
import { AD_EFFECT_PICKS } from '@/content/balance'
import type { AdEffect } from '@/sim/director'
import { AD_EFFECTS, AD_EFFECT_LABELS } from './labels'

interface AdPanelProps {
  /** 투입할 대기 출연자 수. 0이면 외적 세팅을 막는다(Ruling 21). */
  benchLeft: number
  /** 개입 중에 열어 개입의 남은 시간을 이어받았을 때만 있다. 평상시에는 null이라 표시하지 않는다. */
  secondsLeft: number | null
  onConfirm(effects: AdEffect[]): void
  onCancel(): void
}

/**
 * 광고 효과 3개 중 AD_EFFECT_PICKS개를 고른다. 취소할 수 있다. 평상시에 열면 시간 제한이 없고,
 * 개입 중에 열면 개입의 남은 시간이 다 될 때 루프가 패널을 닫는다(Ruling 5a).
 */
export function AdPanel({ benchLeft, secondsLeft, onConfirm, onCancel }: AdPanelProps) {
  const [picked, setPicked] = useState<AdEffect[]>([])
  const full = picked.length >= AD_EFFECT_PICKS

  const toggle = (effect: AdEffect): void => {
    setPicked((current) =>
      current.includes(effect) ? current.filter((item) => item !== effect) : [...current, effect],
    )
  }

  return (
    <section
      data-testid="ad-panel"
      className="flex flex-col gap-2 rounded-xl border-2 border-amber-400 bg-slate-950 p-3 shadow-[4px_4px_0_#000]"
    >
      <header className="flex items-center justify-between">
        <span className="font-bold">광고 효과를 {AD_EFFECT_PICKS}개 고르세요</span>
        {secondsLeft !== null && (
          <span data-testid="ad-seconds" className="tabular-nums text-amber-300">
            {secondsLeft.toFixed(1)}초
          </span>
        )}
      </header>
      <p className="text-xs text-neutral-300">
        광고 동안 시청률 집계가 멈추고, 복귀할 때 시청자 일부가 떠나며, 진행 중이던 연쇄가 끊깁니다.
      </p>
      {AD_EFFECTS.map((effect) => {
        const isPicked = picked.includes(effect)
        const blocked = effect === 'setup' && benchLeft === 0
        const disabled = blocked || (!isPicked && full)
        const { title, description } = AD_EFFECT_LABELS[effect]
        return (
          <button
            key={effect}
            type="button"
            data-testid={`ad-effect-${effect}`}
            aria-pressed={isPicked}
            disabled={disabled}
            onClick={() => toggle(effect)}
            className={`rounded border px-2 py-1.5 text-left text-sm disabled:opacity-40 ${
              isPicked ? 'border-amber-300 bg-amber-600/50' : 'border-neutral-600 bg-neutral-800'
            }`}
          >
            <div className="font-bold">{title}</div>
            <div className="text-xs text-neutral-300">
              {blocked ? '투입할 대기 게스트가 없습니다' : description}
            </div>
          </button>
        )
      })}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1 text-sm text-neutral-300 hover:text-white"
        >
          취소 (Esc)
        </button>
        <button
          type="button"
          data-testid="ad-confirm"
          disabled={picked.length !== AD_EFFECT_PICKS}
          onClick={() => onConfirm(picked)}
          className="rounded bg-amber-500 px-3 py-1 text-sm font-bold text-neutral-950 disabled:opacity-40"
        >
          광고 내보내기
        </button>
      </div>
    </section>
  )
}
