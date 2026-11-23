import { addStatus, applyDamage, createEntity, type Entity, heal, isAlive } from '@/kit/core/entity'
import { TOKENS } from '@/game/content/tokens'
import { type ActionTarget, getWord, type TokenId, type VerbAction } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import { type Board, getSlot, type PlacedWord, type SlotState } from '@/game/sentence/board'

/** 대상 단어가 가리키는 개체 id. 토큰이 없으면 summon으로 소환을 요청한다. */
export function resolveTargets(word: PlacedWord, entities: readonly Entity[]): { ids: string[]; summon: TokenId | null } {
  const effect = getWord(word.wordId).effect
  if (effect.type !== 'target') return { ids: [], summon: null }
  const ref = effect.ref
  switch (ref.kind) {
    case 'player':
      return { ids: entities.filter((e) => e.side === 'ally' && e.defId === 'player').map((e) => e.id), summon: null }
    case 'chosenEnemy':
      return { ids: word.targetEntityId ? [word.targetEntityId] : [], summon: null }
    case 'enemyDef':
      return {
        ids: entities.filter((e) => e.side === 'enemy' && e.defId === ref.defId && isAlive(e)).map((e) => e.id),
        summon: null,
      }
    case 'token': {
      const existing = entities.find((e) => e.defId === ref.tokenId && isAlive(e))
      return existing ? { ids: [existing.id], summon: null } : { ids: [], summon: ref.tokenId }
    }
  }
}

function modifierProduct(slot: SlotState, pick: (word: PlacedWord) => number): number {
  return slot.modifiers.reduce((product, modifier) => (modifier ? product * pick(modifier) : product), 1)
}

function powerMultiplier(verbSlot: SlotState): number {
  return modifierProduct(verbSlot, (word) => {
    const effect = getWord(word.wordId).effect
    return effect.type === 'adverb'
      ? effect.mods.reduce((p, mod) => (mod.kind === 'powerMul' ? p * mod.value : p), 1)
      : 1
  })
}

function outgoingDamageMultiplier(subjectSlot: SlotState): number {
  return modifierProduct(subjectSlot, (word) => {
    const effect = getWord(word.wordId).effect
    return effect.type === 'adjective'
      ? effect.mods.reduce((p, mod) => (mod.kind === 'outgoingDamageMul' ? p * mod.value : p), 1)
      : 1
  })
}

function onHitPoison(subjectSlot: SlotState): number {
  return subjectSlot.modifiers.reduce((sum, modifier) => {
    if (!modifier) return sum
    const effect = getWord(modifier.wordId).effect
    if (effect.type !== 'adjective') return sum
    return sum + effect.mods.reduce((s, mod) => (mod.kind === 'onHitPoison' ? s + mod.amount : s), 0)
  }, 0)
}

function needsObject(actions: readonly VerbAction[]): boolean {
  return actions.some((a) => a.kind === 'damage' || ('to' in a && a.to === 'object'))
}

/** 개체 목록을 다루는 작은 작업 공간. 개체가 죽는 순간 사망 이벤트를 공유 이벤트 목록에 바로 기록한다. */
class EntityTable {
  private entities: Entity[]
  private readonly events: CombatEvent[]

  constructor(initial: readonly Entity[], events: CombatEvent[]) {
    this.entities = [...initial]
    this.events = events
  }

  all(): Entity[] {
    return this.entities
  }

  get(id: string): Entity | undefined {
    return this.entities.find((e) => e.id === id)
  }

  alive(ids: readonly string[]): string[] {
    return ids.filter((id) => {
      const e = this.get(id)
      return e !== undefined && isAlive(e)
    })
  }

  add(entity: Entity): void {
    this.entities.push(entity)
  }

  update(id: string, change: (e: Entity) => Entity): void {
    const before = this.get(id)
    if (!before) return
    const after = change(before)
    this.entities = this.entities.map((e) => (e.id === id ? after : e))
    if (isAlive(before) && !isAlive(after)) this.events.push({ type: 'died', entityId: id })
  }
}

/** 절 하나를 실행한다. (Plan 1: 타동 문형) */
export function resolveClause(
  board: Board,
  clause: number,
  entities: readonly Entity[],
  newId: () => string,
): { entities: Entity[]; events: CombatEvent[] } {
  const subjectSlot = getSlot(board, { clause, role: 'subject' })
  const objectSlot = getSlot(board, { clause, role: 'object' })
  const verbSlot = getSlot(board, { clause, role: 'verb' })
  const verbEffect = getWord(verbSlot.head.wordId).effect
  const actions = verbEffect.type === 'verb' ? verbEffect.actions : []

  const events: CombatEvent[] = [{ type: 'clauseExecuted', clause }]
  const table = new EntityTable(entities, events)
  const finish = () => ({ entities: table.all(), events })

  const resolveSlot = (slot: SlotState): string[] => {
    const { ids, summon } = resolveTargets(slot.head, table.all())
    if (!summon) return ids
    const id = newId()
    table.add(createEntity({ id, defId: summon, name: TOKENS[summon].name, side: 'ally', hp: TOKENS[summon].hp }))
    events.push({ type: 'summoned', entityId: id, tokenId: summon })
    return [id]
  }

  const subjects = table.alive(resolveSlot(subjectSlot))
  if (subjects.length === 0) {
    events.push({ type: 'fizzled', clause, reason: 'noSubject' })
    return finish()
  }
  const objects = needsObject(actions) ? table.alive(resolveSlot(objectSlot)) : []
  if (needsObject(actions) && objects.length === 0) {
    events.push({ type: 'fizzled', clause, reason: 'noObject' })
    return finish()
  }

  const power = powerMultiplier(verbSlot)
  const damageMultiplier = power * outgoingDamageMultiplier(subjectSlot)
  const poisonOnHit = onHitPoison(subjectSlot)

  for (const subjectId of subjects) {
    const subject = table.get(subjectId)
    if (!subject || !isAlive(subject)) continue
    if (subject.statuses.freeze > 0) {
      table.update(subjectId, (e) => addStatus(e, 'freeze', -1))
      events.push({ type: 'fizzled', clause, reason: 'frozen' })
      continue
    }
    const targetsOf = (to: ActionTarget) => table.alive(to === 'subject' ? [subjectId] : objects)

    for (const action of actions) {
      switch (action.kind) {
        case 'damage': {
          const amount = Math.floor(action.amount * damageMultiplier)
          for (const objectId of table.alive(objects)) {
            const before = table.get(objectId)
            if (!before) continue
            const result = applyDamage(before, amount)
            events.push({ type: 'damaged', entityId: objectId, amount: result.dealt, blocked: result.blocked, sourceId: subjectId })
            table.update(objectId, () => result.entity)
            const target = table.get(objectId)
            if (poisonOnHit > 0 && result.dealt > 0 && target && isAlive(target)) {
              table.update(objectId, (e) => addStatus(e, 'poison', poisonOnHit))
              events.push({ type: 'statusApplied', entityId: objectId, status: 'poison', amount: poisonOnHit })
            }
          }
          break
        }
        case 'block': {
          const amount = Math.floor(action.amount * power)
          for (const id of targetsOf(action.to)) {
            table.update(id, (e) => addStatus(e, 'block', amount))
            events.push({ type: 'statusApplied', entityId: id, status: 'block', amount })
          }
          break
        }
        case 'heal': {
          const amount = Math.floor(action.amount * power)
          for (const id of targetsOf(action.to)) {
            const before = table.get(id)
            if (!before) continue
            const result = heal(before, amount)
            events.push({ type: 'healed', entityId: id, amount: result.healed })
            table.update(id, () => result.entity)
          }
          break
        }
        case 'freeze': {
          for (const id of targetsOf(action.to)) {
            table.update(id, (e) => addStatus(e, 'freeze', 1))
            events.push({ type: 'statusApplied', entityId: id, status: 'freeze', amount: 1 })
          }
          break
        }
      }
    }
  }
  return finish()
}
