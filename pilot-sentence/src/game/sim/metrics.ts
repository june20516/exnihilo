import { type CombatState, PLAYER_ID } from '@/game/combat/combat'

export const MAX_SIM_TURNS = 30

export function combatMetrics(state: CombatState): Record<string, number> {
  const player = state.entities.find((e) => e.id === PLAYER_ID)
  return { hpLost: player ? player.maxHp - player.hp : 0, turns: state.turn }
}
