import { FLOORS } from '@/game/run/floors'
import { offerDetail, offerTitle } from '@/game/run/labels'
import type { RunState } from '@/game/run/run'
import { rerollPrice } from '@/game/run/shop'
import { BuildSummary } from './BuildSummary'

const KIND_LABELS = { word: '단어', upgrade: '강화', structure: '구조', relic: '유물' } as const

interface ShopScreenProps {
  state: RunState
  disabled: boolean
  onBuy: (index: number) => void
  onLeave: () => void
  onReroll: () => void
}

/** 층 사이 상점: 보상 3개. 하나를 사면 남은 보상의 값이 ×1.5 오른다. */
export function ShopScreen({ state, disabled, onBuy, onLeave, onReroll }: ShopScreenProps) {
  const items = state.shop?.items ?? []
  const reroll = state.shop ? rerollPrice(state.shop) : null
  return (
    <main className="flex min-h-0 flex-col gap-4 overflow-hidden p-6" data-testid="shop">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-prose text-3xl font-black">상점</h2>
          <p className="text-sm text-on-surface-variant">
            {state.floor}층을 통과했습니다. 하나를 사면 남은 보상의 값이 ×1.5 오릅니다. 남은 화폐는 다음 상점으로 이월됩니다.
          </p>
        </div>
        <div className="flex gap-2">
        {reroll !== null && (
          <button
            type="button"
            data-testid="shop-reroll"
            disabled={disabled || reroll > state.gold}
            onClick={onReroll}
            title="팔리지 않은 보상을 새로 뽑습니다. 쓸 때마다 값이 오릅니다."
            className="rounded-xl bg-surface-container-high px-4 py-3 font-ui text-lg font-bold disabled:opacity-50"
          >
            새로고침 ({reroll})
          </button>
        )}
        <button
          type="button"
          data-testid="leave-shop"
          disabled={disabled}
          onClick={onLeave}
          className="rounded-xl bg-primary-container px-6 py-3 font-ui text-xl font-bold text-on-primary-container disabled:opacity-50"
        >
          다음 층으로 ({state.floor + 1}/{FLOORS.length})
        </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {items.map((item, index) => {
          const poor = !item.sold && item.price > state.gold
          return (
            <button
              key={index}
              type="button"
              data-testid="offer"
              data-poor={poor}
              disabled={disabled || item.sold || poor}
              onClick={() => onBuy(index)}
              className={`flex h-56 flex-col justify-between rounded-xl p-4 text-left shadow-xl transition ${
                item.sold ? 'bg-surface-container opacity-40' : 'bg-surface-container-high enabled:hover:ring-2 enabled:hover:ring-secondary'
              } disabled:cursor-not-allowed`}
            >
              <div className="flex flex-col gap-2">
                <span className="font-ui text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {KIND_LABELS[item.offer.kind]}
                </span>
                <span className="font-card text-xl font-black">
                  {offerTitle(item.offer, state.build, !item.sold)}
                </span>
                {!item.sold && <span className="text-sm leading-snug text-on-surface-variant">{offerDetail(item.offer, state.build)}</span>}
              </div>
              <span className={`font-number text-lg font-bold ${poor ? 'text-error' : 'text-secondary'}`} data-testid="offer-price">
                {item.sold ? '팔림' : `${item.price} 화폐${poor ? ' · 화폐 부족' : ''}`}
              </span>
            </button>
          )
        })}
      </div>
      <BuildSummary build={state.build} deck={state.deck} />
    </main>
  )
}
