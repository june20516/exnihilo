export type Side = 'ally' | 'enemy'
export type Row = 'front' | 'back'
export type StatusKind = 'block' | 'poison' | 'freeze' | 'strength' | 'weak' | 'vulnerable'

export const WEAK_MULTIPLIER = 0.75
export const VULNERABLE_MULTIPLIER = 1.5

export interface Entity {
  readonly id: string
  readonly defId: string
  readonly name: string
  readonly side: Side
  readonly row: Row
  readonly hp: number
  readonly maxHp: number
  readonly statuses: Readonly<Record<StatusKind, number>>
  /** statuses.block 중 이번 턴에 얻은 몫. 다음 턴 종료까지 유지된다. */
  readonly freshBlock: number
  /** 이번 턴에 걸린 약화·취약. 걸린 턴의 종료에는 지속 시간이 줄지 않는다. */
  readonly freshTimed: Readonly<Record<TimedStatus, boolean>>
}

type TimedStatus = 'weak' | 'vulnerable'

export interface CreateEntityParams {
  id: string
  defId: string
  name: string
  side: Side
  hp: number
  row?: Row
}

export function createEntity(params: CreateEntityParams): Entity {
  return {
    id: params.id,
    defId: params.defId,
    name: params.name,
    side: params.side,
    row: params.row ?? 'front',
    hp: params.hp,
    maxHp: params.hp,
    statuses: { block: 0, poison: 0, freeze: 0, strength: 0, weak: 0, vulnerable: 0 },
    freshBlock: 0,
    freshTimed: { weak: false, vulnerable: false },
  }
}

export function isAlive(entity: Entity): boolean {
  return entity.hp > 0
}

/** 보호가 먼저 흡수하고(묵은 보호부터) 남은 피해만 HP에서 뺀다. */
export function applyDamage(
  entity: Entity,
  amount: number,
): { entity: Entity; dealt: number; blocked: number } {
  const oldBlock = entity.statuses.block - entity.freshBlock
  const fromOld = Math.min(oldBlock, amount)
  const fromFresh = Math.min(entity.freshBlock, amount - fromOld)
  const blocked = fromOld + fromFresh
  const dealt = Math.min(entity.hp, amount - blocked)
  return {
    entity: {
      ...entity,
      hp: entity.hp - dealt,
      statuses: { ...entity.statuses, block: entity.statuses.block - blocked },
      freshBlock: entity.freshBlock - fromFresh,
    },
    dealt,
    blocked,
  }
}

export function heal(entity: Entity, amount: number): { entity: Entity; healed: number } {
  const healed = Math.min(amount, entity.maxHp - entity.hp)
  return { entity: { ...entity, hp: entity.hp + healed }, healed }
}

export function addStatus(entity: Entity, kind: StatusKind, amount: number): Entity {
  const next = Math.max(0, entity.statuses[kind] + amount)
  return {
    ...entity,
    statuses: { ...entity.statuses, [kind]: next },
    freshBlock: kind === 'block' ? Math.min(next, entity.freshBlock + Math.max(0, amount)) : entity.freshBlock,
    freshTimed:
      (kind === 'weak' || kind === 'vulnerable') && amount > 0 ? { ...entity.freshTimed, [kind]: true } : entity.freshTimed,
  }
}

/** 턴 종료: 독은 보호를 무시하고 피해를 준 뒤 1 줄고, 지난 턴에 얻은 보호는 사라진다(이번 턴 몫만 남음). */
export function tickEndOfTurn(entity: Entity): { entity: Entity; poisonDamage: number } {
  const poisonDamage = Math.min(entity.hp, entity.statuses.poison)
  return {
    entity: {
      ...entity,
      hp: entity.hp - poisonDamage,
      statuses: {
        ...entity.statuses,
        poison: Math.max(0, entity.statuses.poison - 1),
        weak: entity.freshTimed.weak ? entity.statuses.weak : Math.max(0, entity.statuses.weak - 1),
        vulnerable: entity.freshTimed.vulnerable ? entity.statuses.vulnerable : Math.max(0, entity.statuses.vulnerable - 1),
        block: Math.min(entity.statuses.block, entity.freshBlock),
      },
      freshBlock: 0,
      freshTimed: { weak: false, vulnerable: false },
    },
    poisonDamage,
  }
}

/** 공격자의 상태를 반영한 피해: (기본 + 힘) × (약화면 0.75). 반올림은 호출자가 마지막에 한다. */
export function scaleOutgoing(base: number, source: Entity): number {
  return (base + source.statuses.strength) * (source.statuses.weak > 0 ? WEAK_MULTIPLIER : 1)
}

/** 피격자의 상태를 반영한 피해: 취약이면 1.5배. 반올림은 호출자가 마지막에 한다. */
export function scaleIncoming(amount: number, target: Entity): number {
  return amount * (target.statuses.vulnerable > 0 ? VULNERABLE_MULTIPLIER : 1)
}

/** 보호를 무시하고 HP를 직접 깎는다(자해, 대가 등). */
export function loseHp(entity: Entity, amount: number): { entity: Entity; lost: number } {
  const lost = Math.min(entity.hp, Math.max(0, amount))
  return { entity: { ...entity, hp: entity.hp - lost }, lost }
}

export function growMaxHp(entity: Entity, amount: number): Entity {
  return { ...entity, maxHp: entity.maxHp + amount, hp: entity.hp + amount }
}

/** 보호를 모두 없앤다(턴 시작에 보호가 사라지는 규칙). */
export function clearBlock(entity: Entity): Entity {
  return { ...entity, statuses: { ...entity.statuses, block: 0 }, freshBlock: 0 }
}
