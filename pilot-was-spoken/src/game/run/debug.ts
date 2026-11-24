import type { RunState } from './run'

/**
 * 개발 전용(e2e): 새 전투가 시작됐으면 그 전투의 적 HP와 최대 HP를 hp로 만든다.
 * 새 전투란 이전 상태가 없거나, 층이 바뀌었거나, 이전에 전투가 없던 경우다. 그 밖에는 after를 그대로 돌려준다.
 */
export function weakenNewCombat(before: RunState | null, after: RunState, hp: number): RunState {
  if (!after.combat) return after
  const isNew = before === null || before.floor !== after.floor || before.combat === null
  if (!isNew) return after
  const entities = after.combat.entities.map((e) => (e.side === 'enemy' ? { ...e, hp, maxHp: hp } : e))
  return { ...after, combat: { ...after.combat, entities } }
}
