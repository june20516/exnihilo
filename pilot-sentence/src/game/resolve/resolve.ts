import {
  addStatus, applyDamage, createEntity, type Entity, growMaxHp, heal, isAlive, loseHp, scaleIncoming, scaleOutgoing,
} from '@/kit/core/entity'
import { TOKENS } from '@/game/content/tokens'
import { type ActionTarget, type AdjectiveMod, getWord, type TokenId, type VerbAction } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import { type Board, getSlot, isSlotActive, type PlacedWord, type SlotState } from '@/game/sentence/board'

/** 대상 단어가 가리키는 개체 id. 토큰이 없으면 summon으로 소환을 요청한다. */
export function resolveTargets(word: PlacedWord, entities: readonly Entity[]): { ids: string[]; summon: TokenId | null } {
  const effect = getWord(word.wordId).effect
  if (effect.type !== 'target') return { ids: [], summon: null }
  const ref = effect.ref
  const alive = entities.filter(isAlive)
  switch (ref.kind) {
    case 'player':
      return { ids: entities.filter((e) => e.side === 'ally' && e.defId === 'player').map((e) => e.id), summon: null }
    case 'chosenEnemy':
      return { ids: word.targetEntityId ? [word.targetEntityId] : [], summon: null }
    case 'enemyDef':
      return { ids: alive.filter((e) => e.side === 'enemy' && e.defId === ref.defId).map((e) => e.id), summon: null }
    case 'token': {
      const existing = alive.find((e) => e.defId === ref.tokenId)
      return existing ? { ids: [existing.id], summon: null } : { ids: [], summon: ref.tokenId }
    }
    case 'allies':
      return { ids: alive.filter((e) => e.side === 'ally').map((e) => e.id), summon: null }
    case 'everyone':
      return { ids: alive.map((e) => e.id), summon: null }
  }
}

/** 슬롯에 붙은 형용사들을 한 묶음으로 합친 값. 그 슬롯에 있는 개체의 성질이 된다. */
export interface SlotMods {
  readonly outgoingMul: number
  readonly outgoingFlat: number
  readonly incomingMul: number
  readonly incomingFlat: number
  readonly onHitPoison: number
  readonly selfDamageAfter: number
}

export function collectSlotMods(slot: SlotState): SlotMods {
  const mods: AdjectiveMod[] = slot.modifiers.flatMap((m) => {
    const effect = m ? getWord(m.wordId).effect : null
    return effect?.type === 'adjective' ? effect.mods : []
  })
  const product = (kind: 'outgoingDamageMul' | 'incomingMul') =>
    mods.reduce((p, m) => (m.kind === kind ? p * m.value : p), 1)
  const sum = (kind: 'outgoingFlat' | 'incomingFlat' | 'onHitPoison' | 'selfDamageAfter') =>
    mods.reduce((s, m) => (m.kind === kind ? s + m.amount : s), 0)
  return {
    outgoingMul: product('outgoingDamageMul'),
    outgoingFlat: sum('outgoingFlat'),
    incomingMul: product('incomingMul'),
    incomingFlat: sum('incomingFlat'),
    onHitPoison: sum('onHitPoison'),
    selfDamageAfter: sum('selfDamageAfter'),
  }
}

export interface AdverbSummary {
  readonly power: number
  readonly repeat: number
  readonly executionBonus: boolean
  readonly ignoreFreeze: boolean
}

export function collectAdverbs(verbSlot: SlotState): AdverbSummary {
  const mods = verbSlot.modifiers.flatMap((m) => {
    const effect = m ? getWord(m.wordId).effect : null
    return effect?.type === 'adverb' ? effect.mods : []
  })
  return {
    power: mods.reduce((p, m) => (m.kind === 'powerMul' ? p * m.value : p), 1),
    repeat: mods.reduce((r, m) => (m.kind === 'repeat' ? Math.max(r, m.count) : r), 1),
    executionBonus: mods.some((m) => m.kind === 'executionBonus'),
    ignoreFreeze: mods.some((m) => m.kind === 'ignoreFreeze'),
  }
}

function needsObject(actions: readonly VerbAction[]): boolean {
  return actions.some((a) => a.kind === 'damage' || a.kind === 'mutualDamage' || ('to' in a && a.to === 'object'))
}

/** 개체 목록을 다루는 작업 공간. 개체가 죽는 순간 사망 이벤트를 공유 이벤트 목록에 바로 기록한다. */
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

export interface ResolveContext {
  /** 이번 전투에서 지금까지 실행된 절의 수([거듭]용). */
  readonly executions: number
}

/** 절 하나를 실행한다. 동사가 자동사면 목적어 슬롯은 무시된다. */
export function resolveClause(
  board: Board,
  clause: number,
  entities: readonly Entity[],
  newId: () => string,
  context: ResolveContext,
): { entities: Entity[]; events: CombatEvent[] } {
  const subjectSlot = getSlot(board, { clause, role: 'subject' })
  const objectSlot = getSlot(board, { clause, role: 'object' })
  const verbSlot = getSlot(board, { clause, role: 'verb' })
  const verbEffect = getWord(verbSlot.head.wordId).effect
  const actions = verbEffect.type === 'verb' ? verbEffect.actions : []
  const objectActive = isSlotActive(board, { clause, role: 'object' })

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
  const objects = objectActive ? table.alive(resolveSlot(objectSlot)) : []
  if (objectActive && needsObject(actions) && objects.length === 0) {
    events.push({ type: 'fizzled', clause, reason: 'noObject' })
    return finish()
  }

  const subjectMods = collectSlotMods(subjectSlot)
  const objectMods = collectSlotMods(objectSlot)
  const adverbs = collectAdverbs(verbSlot)
  const scaled = (amount: number) => Math.floor(amount * adverbs.power)

  /** 피해 한 번: 공격자 슬롯의 outgoing 수식과 피격자 슬롯의 incoming 수식을 적용한다. */
  const dealDamage = (sourceId: string, sourceMods: SlotMods, targetId: string, targetMods: SlotMods, base: number) => {
    const source = table.get(sourceId)
    const target = table.get(targetId)
    if (!source || !target || !isAlive(target)) return 0
    const powered = base * adverbs.power + (adverbs.executionBonus ? context.executions : 0)
    const outgoing = (scaleOutgoing(powered, source) + sourceMods.outgoingFlat) * sourceMods.outgoingMul
    const amount = Math.max(0, Math.floor(scaleIncoming(outgoing, target) * targetMods.incomingMul) - targetMods.incomingFlat)
    const result = applyDamage(target, amount)
    events.push({ type: 'damaged', entityId: targetId, amount: result.dealt, blocked: result.blocked, sourceId })
    table.update(targetId, () => result.entity)
    const after = table.get(targetId)
    if (sourceMods.onHitPoison > 0 && result.dealt > 0 && after && isAlive(after)) {
      table.update(targetId, (e) => addStatus(e, 'poison', sourceMods.onHitPoison))
      events.push({ type: 'statusApplied', entityId: targetId, status: 'poison', amount: sourceMods.onHitPoison })
    }
    return result.dealt
  }

  const applyAction = (subjectId: string, action: VerbAction) => {
    const targetsOf = (to: ActionTarget) => table.alive(to === 'subject' ? [subjectId] : objects)
    switch (action.kind) {
      case 'damage':
        for (const objectId of table.alive(objects)) {
          const dealt = dealDamage(subjectId, subjectMods, objectId, objectMods, action.amount)
          if (action.lifesteal && dealt > 0) {
            const subject = table.get(subjectId)
            if (subject && isAlive(subject)) {
              const result = heal(subject, dealt)
              events.push({ type: 'healed', entityId: subjectId, amount: result.healed })
              table.update(subjectId, () => result.entity)
            }
          }
        }
        return
      case 'mutualDamage':
        for (const objectId of table.alive(objects)) {
          dealDamage(subjectId, subjectMods, objectId, objectMods, action.amount)
          dealDamage(objectId, objectMods, subjectId, subjectMods, action.amount)
        }
        return
      case 'loseHp':
        for (const id of targetsOf(action.to)) {
          const target = table.get(id)
          if (!target) continue
          const result = loseHp(target, scaled(action.amount))
          events.push({ type: 'hpLost', entityId: id, amount: result.lost })
          table.update(id, () => result.entity)
        }
        return
      case 'block':
        for (const id of targetsOf(action.to)) {
          const amount = scaled(action.amount)
          table.update(id, (e) => addStatus(e, 'block', amount))
          events.push({ type: 'statusApplied', entityId: id, status: 'block', amount })
        }
        return
      case 'heal':
        for (const id of targetsOf(action.to)) {
          const target = table.get(id)
          if (!target) continue
          const result = heal(target, scaled(action.amount))
          events.push({ type: 'healed', entityId: id, amount: result.healed })
          table.update(id, () => result.entity)
        }
        return
      case 'freeze':
        for (const id of targetsOf(action.to)) {
          table.update(id, (e) => addStatus(e, 'freeze', 1))
          events.push({ type: 'statusApplied', entityId: id, status: 'freeze', amount: 1 })
        }
        return
      case 'status':
        for (const id of targetsOf(action.to)) {
          table.update(id, (e) => addStatus(e, action.status, action.amount))
          events.push({ type: 'statusApplied', entityId: id, status: action.status, amount: action.amount })
        }
        return
      case 'grow':
        for (const id of targetsOf(action.to)) {
          const amount = scaled(action.amount)
          table.update(id, (e) => growMaxHp(e, amount))
          events.push({ type: 'grew', entityId: id, amount })
        }
        return
      case 'cleanse':
        for (const id of targetsOf(action.to)) {
          table.update(id, (e) =>
            addStatus(addStatus(addStatus(e, 'poison', -e.statuses.poison), 'weak', -e.statuses.weak), 'freeze', -e.statuses.freeze),
          )
          events.push({ type: 'cleansed', entityId: id })
        }
        return
    }
  }

  for (const subjectId of subjects) {
    const subject = table.get(subjectId)
    if (!subject || !isAlive(subject)) continue
    if (subject.statuses.freeze > 0 && !adverbs.ignoreFreeze) {
      table.update(subjectId, (e) => addStatus(e, 'freeze', -1))
      events.push({ type: 'fizzled', clause, reason: 'frozen' })
      continue
    }
    for (let repetition = 0; repetition < adverbs.repeat; repetition++) {
      const current = table.get(subjectId)
      if (!current || !isAlive(current)) break
      for (const action of actions) applyAction(subjectId, action)
    }
  }

  // 실행 후 자해([굶주린] 등): 그 슬롯에 있던 살아 있는 개체
  const selfDamage: [readonly string[], SlotMods][] = [[subjects, subjectMods], [objects, objectMods]]
  for (const [ids, mods] of selfDamage) {
    if (mods.selfDamageAfter <= 0) continue
    for (const id of table.alive(ids)) {
      const target = table.get(id)
      if (!target) continue
      const result = loseHp(target, mods.selfDamageAfter)
      events.push({ type: 'hpLost', entityId: id, amount: result.lost })
      table.update(id, () => result.entity)
    }
  }
  return finish()
}
