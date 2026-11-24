import { RUN_RULES } from '@/game/content/balance'
import type { EncounterTier } from '@/game/content/enemies'
import type { EnemyScale } from '@/game/rally/combat'

export interface FloorDef {
  readonly tier: EncounterTier
  readonly scale: EnemyScale
}

const BASE: EnemyScale = { hp: 1, damage: 1 }
const HARD: EnemyScale = { hp: 1.3, damage: 1.2 }

/** 런 spec §1: 일반, 일반, 정예, 일반(강화), 일반(강화), 정예, 보스. */
export const FLOORS: readonly FloorDef[] = [
  { tier: 'normal', scale: BASE },
  { tier: 'normal', scale: BASE },
  { tier: 'elite', scale: BASE },
  { tier: 'normal', scale: HARD },
  { tier: 'normal', scale: HARD },
  { tier: 'elite', scale: BASE },
  { tier: 'boss', scale: BASE },
]

export const NORMAL_ENCOUNTERS: readonly string[] = ['spider', 'swarm', 'slime']
/** 정예·보스는 층으로 고정한다. */
export const FIXED_ENCOUNTERS: Readonly<Record<number, string>> = { 3: 'queen', 6: 'gatekeeper', 7: 'scribe' }


/** 화폐 보너스 항목(콤보·오버킬 등). 이번 단계에서는 늘 빈 목록이다. */
export interface GoldBonus {
  readonly id: string
  readonly amount: number
}

/** 받는 화폐 = 기본값 + 보너스 항목의 합(런 spec §2). */
export function goldFor(tier: EncounterTier, bonuses: readonly GoldBonus[]): number {
  return RUN_RULES.rewardGold[tier] + bonuses.reduce((sum, b) => sum + b.amount, 0)
}
