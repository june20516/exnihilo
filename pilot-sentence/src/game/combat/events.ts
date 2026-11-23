import type { StatusKind } from '@/kit/core/entity'
import type { InterventionStep, SlotAddress } from '@/game/content/encounters'
import type { TokenId, WordId } from '@/game/content/words'

export type RejectReason =
  | 'kindMismatch'
  | 'modifiersFull'
  | 'slotInactive'
  | 'notEnoughAp'
  | 'unplayable'
  | 'noTarget'
  | 'notPlayerTurn'
  | 'noSwapLeft'
  | 'slotSealed'
  | 'noPaidDraw'
  | 'deckEmpty'
  | 'cannotCast'
  | 'noVerb'
  | 'noDiscardLeft'
export type FizzleReason = 'noSubject' | 'noObject' | 'frozen'

export type CombatEvent =
  | { readonly type: 'placed'; readonly at: SlotAddress; readonly wordId: WordId; readonly modifierIndex: number | null }
  | { readonly type: 'rejected'; readonly reason: RejectReason; readonly at: SlotAddress | null }
  | { readonly type: 'apSpent'; readonly amount: number }
  | { readonly type: 'intervention'; readonly step: InterventionStep }
  | { readonly type: 'clauseExecuted'; readonly clause: number }
  | { readonly type: 'fizzled'; readonly clause: number; readonly reason: FizzleReason }
  | { readonly type: 'damaged'; readonly entityId: string; readonly amount: number; readonly blocked: number; readonly sourceId: string }
  | { readonly type: 'healed'; readonly entityId: string; readonly amount: number }
  | { readonly type: 'statusApplied'; readonly entityId: string; readonly status: StatusKind; readonly amount: number }
  | { readonly type: 'poisonTick'; readonly entityId: string; readonly amount: number }
  | { readonly type: 'hpLost'; readonly entityId: string; readonly amount: number }
  | { readonly type: 'grew'; readonly entityId: string; readonly amount: number }
  | { readonly type: 'cleansed'; readonly entityId: string }
  | { readonly type: 'swapped'; readonly clause: number }
  | { readonly type: 'burned'; readonly wordId: WordId }
  | { readonly type: 'cast'; readonly by: 'player' | 'enemy' }
  | { readonly type: 'resourceGained'; readonly amount: number; readonly total: number }
  | { readonly type: 'summoned'; readonly entityId: string; readonly tokenId: TokenId }
  | { readonly type: 'died'; readonly entityId: string }
  | { readonly type: 'dried'; readonly at: SlotAddress; readonly wordId: WordId; readonly modifierIndex: number | null }
  | { readonly type: 'polluted'; readonly wordId: WordId; readonly count: number }
  | { readonly type: 'drawn'; readonly count: number; readonly reshuffled: boolean }
  | { readonly type: 'intentRevealed'; readonly step: InterventionStep }
  | { readonly type: 'combatEnded'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'enemyTurn' }
  | { readonly type: 'discarded'; readonly count: number }
  | { readonly type: 'cleared' }
  | { readonly type: 'targetChanged'; readonly entityId: string }
