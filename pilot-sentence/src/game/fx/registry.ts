import type { EffectHandlers } from '@/kit/fx/effectPlayer'
import type { CombatEvent } from '@/game/combat/events'

/** 전투 이벤트별 연출. (Task 11에서 채운다) */
export const fxRegistry: EffectHandlers<CombatEvent> = {}
