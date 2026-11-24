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
  /** 보호 덩어리. statuses.block은 언제나 이 amount들의 합이다. */
  readonly blockChunks: readonly BlockChunk[]
  /** 이번 턴에 걸린 약화·취약. 걸린 턴의 종료에는 지속 시간이 줄지 않는다. */
  readonly freshTimed: Readonly<Record<TimedStatus, boolean>>
}

type TimedStatus = 'weak' | 'vulnerable'

/**
 * 보호 한 덩어리. turnsLeft는 주인의 차례 시작을 몇 번 더 넘기는가다.
 * 0이면 주인의 다음 차례 시작에 사라지고, n이면 n번 더 넘긴다.
 */
export interface BlockChunk {
  readonly amount: number
  readonly turnsLeft: number
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
    statuses: { block: 0, poison: 0, freeze: 0, strength: 0, weak: 0, vulnerable: 0 },
    blockChunks: [],
    freshTimed: { weak: false, vulnerable: false },
  }
}

export function isAlive(entity: Entity): boolean {
  return entity.hp > 0
}

/** 덩어리를 바꾸고 보호 합(statuses.block)을 다시 맞춘다. 0인 덩어리는 남기지 않는다. */
function withChunks(entity: Entity, chunks: readonly BlockChunk[]): Entity {
  const kept = chunks.filter((c) => c.amount > 0)
  const block = kept.reduce((sum, c) => sum + c.amount, 0)
  return { ...entity, blockChunks: kept, statuses: { ...entity.statuses, block } }
}

/** 보호 덩어리를 더한다. holds는 이월하는 턴 수(카드 속성). */
export function addBlock(entity: Entity, amount: number, holds: number): Entity {
  return withChunks(entity, [...entity.blockChunks, { amount: Math.max(0, amount), turnsLeft: Math.max(0, holds) }])
}

/** 주인의 차례 시작: 남은 턴이 0인 덩어리는 사라지고, 나머지는 1씩 준다. */
export function expireBlock(entity: Entity): Entity {
  return withChunks(entity, entity.blockChunks.filter((c) => c.turnsLeft > 0).map((c) => ({ ...c, turnsLeft: c.turnsLeft - 1 })))
}

/** 보호를 모두 없앤다(되받아친다). */
export function removeAllBlock(entity: Entity): { entity: Entity; removed: number } {
  return { entity: withChunks(entity, []), removed: entity.statuses.block }
}

/**
 * 보호가 먼저 흡수하고 남은 피해만 HP에서 뺀다.
 * 곧 사라질 덩어리(turnsLeft가 작은 것)부터, 같으면 먼저 생긴 것부터 깎는다.
 */
export function applyDamage(
  entity: Entity,
  amount: number,
): { entity: Entity; dealt: number; blocked: number } {
  const order = entity.blockChunks.map((chunk, index) => ({ chunk, index })).sort((a, b) => a.chunk.turnsLeft - b.chunk.turnsLeft || a.index - b.index)
  const remaining = entity.blockChunks.map((c) => c.amount)
  let left = amount
  for (const { index } of order) {
    const used = Math.min(remaining[index], left)
    remaining[index] -= used
    left -= used
  }
  const blocked = amount - left
  const dealt = Math.min(entity.hp, left)
  const chunks = entity.blockChunks.map((c, i) => ({ ...c, amount: remaining[i] }))
  return { entity: { ...withChunks(entity, chunks), hp: entity.hp - dealt }, dealt, blocked }
}

export function heal(entity: Entity, amount: number): { entity: Entity; healed: number } {
  const healed = Math.min(amount, entity.maxHp - entity.hp)
  return { entity: { ...entity, hp: entity.hp + healed }, healed }
}

/** 보호를 뺀 상태를 더한다(보호는 addBlock). */
export function addStatus(entity: Entity, kind: Exclude<StatusKind, 'block'>, amount: number): Entity {
  const next = Math.max(0, entity.statuses[kind] + amount)
  return {
    ...entity,
    statuses: { ...entity.statuses, [kind]: next },
    freshTimed:
      (kind === 'weak' || kind === 'vulnerable') && amount > 0 ? { ...entity.freshTimed, [kind]: true } : entity.freshTimed,
  }
}

/** 턴 종료: 독은 보호를 무시하고 피해를 준 뒤 1 줄고, 약화·취약이 준다. 보호는 주인의 차례 시작에 expireBlock이 다룬다. */
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
      },
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

