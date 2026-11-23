export type Side = 'ally' | 'enemy'
export type Row = 'front' | 'back'
export type StatusKind = 'block' | 'poison' | 'freeze'

export interface Entity {
  readonly id: string
  readonly defId: string
  readonly name: string
  readonly side: Side
  readonly row: Row
  readonly hp: number
  readonly maxHp: number
  readonly statuses: Readonly<Record<StatusKind, number>>
}

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
    statuses: { block: 0, poison: 0, freeze: 0 },
  }
}

export function isAlive(entity: Entity): boolean {
  return entity.hp > 0
}

/** 보호가 먼저 흡수하고 남은 피해만 HP에서 뺀다. */
export function applyDamage(
  entity: Entity,
  amount: number,
): { entity: Entity; dealt: number; blocked: number } {
  const blocked = Math.min(entity.statuses.block, amount)
  const dealt = Math.min(entity.hp, amount - blocked)
  return {
    entity: {
      ...entity,
      hp: entity.hp - dealt,
      statuses: { ...entity.statuses, block: entity.statuses.block - blocked },
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
  return {
    ...entity,
    statuses: { ...entity.statuses, [kind]: Math.max(0, entity.statuses[kind] + amount) },
  }
}

/** 턴 종료: 독은 보호를 무시하고 피해를 준 뒤 1 줄고, 보호는 사라진다. */
export function tickEndOfTurn(entity: Entity): { entity: Entity; poisonDamage: number } {
  const poisonDamage = Math.min(entity.hp, entity.statuses.poison)
  return {
    entity: {
      ...entity,
      hp: entity.hp - poisonDamage,
      statuses: {
        ...entity.statuses,
        poison: Math.max(0, entity.statuses.poison - 1),
        block: 0,
      },
    },
    poisonDamage,
  }
}
