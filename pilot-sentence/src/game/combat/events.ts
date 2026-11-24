import type { StatusKind } from '@/kit/core/entity'
import type { SlotAddress } from '@/game/content/enemies'
import type { SlotRole } from '@/game/grammar/frames'
import type { TokenId, WordId } from '@/game/content/words'

export type RejectReason =
  | 'kindMismatch'
  | 'modifiersFull'
  | 'slotInactive'
  | 'unplayable'
  | 'noTarget'
  | 'notPlayerTurn'
  | 'noVerb'
  | 'slotSealed'
  | 'notEnoughGold'
  | 'soldOut'
  | 'noDiscardLeft'
export type FizzleReason = 'noSubject' | 'noObject' | 'frozen'

export type CombatEvent =
  | { readonly type: 'placed'; readonly at: SlotAddress; readonly wordId: WordId; readonly modifierIndex: number | null }
  | { readonly type: 'rejected'; readonly reason: RejectReason; readonly at: SlotAddress | null }
  | { readonly type: 'clauseExecuted'; readonly clause: number }
  | { readonly type: 'fizzled'; readonly clause: number; readonly reason: FizzleReason }
  | { readonly type: 'damaged'; readonly entityId: string; readonly amount: number; readonly blocked: number; readonly sourceId: string }
  | { readonly type: 'healed'; readonly entityId: string; readonly amount: number }
  | { readonly type: 'statusApplied'; readonly entityId: string; readonly status: StatusKind; readonly amount: number }
  | { readonly type: 'poisonTick'; readonly entityId: string; readonly amount: number }
  | { readonly type: 'hpLost'; readonly entityId: string; readonly amount: number }
  | { readonly type: 'grew'; readonly entityId: string; readonly amount: number }
  | { readonly type: 'cleansed'; readonly entityId: string }
  | { readonly type: 'burned'; readonly wordId: WordId }
  | { readonly type: 'cast'; readonly by: 'player' | 'enemy' }
  | { readonly type: 'summoned'; readonly entityId: string; readonly tokenId: TokenId }
  | { readonly type: 'died'; readonly entityId: string }
  | { readonly type: 'drawn'; readonly count: number }
  /** 서고가 바닥나 뽑지 못한 장수와 그 대가로 잃은 HP(보호·감소 무시). */
  | { readonly type: 'emptyDraw'; readonly missing: number; readonly hpLost: number }
  /** 떠올리기로 망각에서 서고로 옮긴 장수. */
  | { readonly type: 'recalled'; readonly count: number }
  | { readonly type: 'combatEnded'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'enemyTurn' }
  | { readonly type: 'discarded'; readonly count: number }
  | { readonly type: 'cleared' }
  | { readonly type: 'connected'; readonly wordId: WordId }
  | { readonly type: 'disconnected' }
  | { readonly type: 'sealed'; readonly role: SlotRole }
  | { readonly type: 'targetChanged'; readonly entityId: string }

/** 낭독·턴 종료처럼 차례가 넘어가는 행동의 이벤트인가. 화면은 이때 연출이 끝날 때까지 행동 직전 상태를 보여 준다. */
export function resolvesTurn(events: readonly CombatEvent[]): boolean {
  return events.some((e) => e.type === 'cast' || e.type === 'enemyTurn')
}
