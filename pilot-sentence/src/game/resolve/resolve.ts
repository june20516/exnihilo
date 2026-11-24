import { PLAYER_DEF_ID } from '@/game/content/characters'
import {
  addBlock, addStatus, applyDamage, removeAllBlock, createEntity, type Entity, growMaxHp, heal, isAlive, loseHp, scaleIncoming, scaleOutgoing,
} from '@/kit/core/entity'
import { TOKENS } from '@/game/content/tokens'
import { type ActionTarget, type AdjectiveMod, getWord, type TokenId, type VerbAction, type WordDef, type WordId } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import { type Board, getSlot, isSlotActive, type PlacedWord, type SlotState } from '@/game/sentence/board'

/** 대상 단어가 가리키는 개체 id. 토큰이 없으면 summon으로 소환을 요청한다. */
export type WordLookup = (id: WordId) => WordDef

export function resolveTargets(
  word: PlacedWord,
  entities: readonly Entity[],
  lookup: WordLookup = getWord,
): { ids: string[]; summon: TokenId | null } {
  const effect = lookup(word.wordId).effect
  if (effect.type !== 'target') return { ids: [], summon: null }
  const ref = effect.ref
  const alive = entities.filter(isAlive)
  switch (ref.kind) {
    case 'player':
      return { ids: entities.filter((e) => e.side === 'ally' && e.defId === PLAYER_DEF_ID).map((e) => e.id), summon: null }
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

export function adjectiveCount(slot: SlotState, lookup: WordLookup = getWord): number {
  return slot.modifiers.filter((m) => m !== null && lookup(m.wordId).effect.type === 'adjective').length
}

/** 수식의 사슬 훅이 이 슬롯에 주는 배율. 형용사 수가 모자라거나 훅이 없으면 1. */
export function chainFactorOf(slot: SlotState, lookup: WordLookup, chainBoost: ChainBoost | undefined): number {
  return chainBoost && adjectiveCount(slot, lookup) >= chainBoost.minAdjectives ? chainBoost.factor : 1
}

export function collectSlotMods(slot: SlotState, lookup: WordLookup = getWord, chainBoost?: ChainBoost): SlotMods {
  const chain = chainFactorOf(slot, lookup, chainBoost)
  const mods: AdjectiveMod[] = slot.modifiers.flatMap((m) => {
    const effect = m ? lookup(m.wordId).effect : null
    return effect?.type === 'adjective' ? effect.mods : []
  })
  return combineMods(mods, chain)
}

/** 형용사 효과 목록을 하나의 수식으로: 배율은 곱하고 가산은 더한다. chain은 배율에 곱하는 사슬 배율. */
export function combineMods(mods: readonly AdjectiveMod[], chain = 1): SlotMods {
  const product = (kind: 'outgoingDamageMul' | 'incomingMul') =>
    mods.reduce((p, m) => (m.kind === kind ? p * m.value : p), 1)
  const sum = (kind: 'outgoingFlat' | 'incomingFlat' | 'onHitPoison' | 'selfDamageAfter') =>
    mods.reduce((s, m) => (m.kind === kind ? s + m.amount : s), 0)
  return {
    outgoingMul: product('outgoingDamageMul') * chain,
    outgoingFlat: sum('outgoingFlat'),
    incomingMul: product('incomingMul') * chain,
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

export function collectAdverbs(verbSlot: SlotState, lookup: WordLookup = getWord, hooks: ClauseHooks = {}): AdverbSummary {
  const mods = verbSlot.modifiers.flatMap((m) => {
    const effect = m ? lookup(m.wordId).effect : null
    return effect?.type === 'adverb' ? effect.mods : []
  })
  const power = mods.reduce((p, m) => (m.kind === 'powerMul' ? p * m.value : p), 1)
  return {
    power: hooks.adverbTwice ? power * power : power,
    repeat: mods.reduce((r, m) => (m.kind === 'repeat' ? Math.max(r, m.count) : r), 1) + (hooks.repeatBonus ?? 0),
    executionBonus: mods.some((m) => m.kind === 'executionBonus'),
    ignoreFreeze: mods.some((m) => m.kind === 'ignoreFreeze'),
  }
}

function needsObject(actions: readonly VerbAction[]): boolean {
  return actions.some((a) => a.kind === 'damage' || a.kind === 'mutualDamage' || a.kind === 'counter' || ('to' in a && a.to === 'object'))
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

/**
 * 빌드 레이어(유물·연결어·층 배율)가 해석에 끼어드는 자리. 모두 선택이며, 없으면 기본 규칙과 같다.
 */
export interface ChainBoost {
  readonly factor: number
  readonly minAdjectives: number
}

export interface ClauseHooks {
  /** 피해 동작 기본값 가산. */
  readonly damageBonus?: number
  /** 보호·회복 동작 기본값 가산. */
  readonly supportBonus?: number
  /** 한 슬롯에 형용사가 minAdjectives개 이상이면 그 슬롯 배율 ×factor(수식의 사슬). */
  readonly chainBoost?: ChainBoost
  /** 부사 세기를 두 번 적용(강세). */
  readonly adverbTwice?: boolean
  /** 독을 거는 효과 가산. */
  readonly poisonBonus?: number
  /** 반복 횟수 가산. */
  readonly repeatBonus?: number
  /** 피해 동작 기본값 배율(층 배율). 기본 1. */
  readonly damageScale?: number
}

export const NO_MODS: SlotMods = combineMods([])

/** 개체에 남은 형용사(지속 enemyTurn)의 수식. 사슬은 붙이지 않는다(형용사 상태 spec §3). */
export function lingeringMods(wordIds: readonly WordId[], lookup: WordLookup = getWord): SlotMods {
  return combineMods(wordIds.flatMap((id) => {
    const effect = lookup(id).effect
    return effect.type === 'adjective' && effect.lasts === 'enemyTurn' ? effect.mods : []
  }))
}

function mergeMods(a: SlotMods, b: SlotMods): SlotMods {
  return {
    outgoingMul: a.outgoingMul * b.outgoingMul,
    outgoingFlat: a.outgoingFlat + b.outgoingFlat,
    incomingMul: a.incomingMul * b.incomingMul,
    incomingFlat: a.incomingFlat + b.incomingFlat,
    onHitPoison: a.onHitPoison + b.onHitPoison,
    selfDamageAfter: a.selfDamageAfter + b.selfDamageAfter,
  }
}

export interface ResolveContext {
  /** 이번 전투에서 지금까지 실행된 절의 수([거듭]용). */
  readonly executions: number
  /** 단어 정의 조회(강화 반영). 기본은 원래 정의. */
  readonly lookup?: WordLookup
  readonly hooks?: ClauseHooks
  /** 개체에 남은 형용사 상태의 수식(적 차례에만 넘긴다). 피해를 주고받을 때 칸의 수식과 합친다. */
  readonly lingering?: (entityId: string) => SlotMods
}

/** 절 하나를 실행한다. 동사가 자동사면 목적어 슬롯은 무시된다. */
export interface ResolvedClause {
  readonly entities: Entity[]
  readonly events: CombatEvent[]
  readonly targets: { readonly subject: readonly string[]; readonly object: readonly string[] }
  /** 이 절에서 실행된 떠올리기 장수의 합(반복 포함). 덱 이동은 전투 흐름이 한다. */
  readonly recalls: number
}

export function resolveClause(
  board: Board,
  clause: number,
  entities: readonly Entity[],
  newId: () => string,
  context: ResolveContext,
): ResolvedClause {
  const subjectSlot = getSlot(board, { clause, role: 'subject' })
  const objectSlot = getSlot(board, { clause, role: 'object' })
  const verbSlot = getSlot(board, { clause, role: 'verb' })
  const lookup = context.lookup ?? getWord
  const hooks = context.hooks ?? {}
  const verbEffect = lookup(verbSlot.head.wordId).effect
  const actions = verbEffect.type === 'verb' ? verbEffect.actions : []
  const objectActive = isSlotActive(board, { clause, role: 'object' })

  const events: CombatEvent[] = [{ type: 'clauseExecuted', clause }]
  const table = new EntityTable(entities, events)
  /** 칸별로 실제 해석한 대상(이번 절에서 불러낸 토큰 포함). 형용사 상태가 이 개체들에 남는다. */
  const targets = { subject: [] as string[], object: [] as string[] }
  let recalls = 0
  const finish = (): ResolvedClause => ({ entities: table.all(), events, targets, recalls })

  const resolveSlot = (slot: SlotState): string[] => {
    const { ids, summon } = resolveTargets(slot.head, table.all(), lookup)
    if (!summon) return ids
    const id = newId()
    table.add(createEntity({ id, defId: summon, name: TOKENS[summon].name, side: 'ally', hp: TOKENS[summon].hp }))
    events.push({ type: 'summoned', entityId: id, tokenId: summon })
    return [id]
  }

  const subjects = table.alive(resolveSlot(subjectSlot))
  targets.subject = subjects
  if (subjects.length === 0) {
    events.push({ type: 'fizzled', clause, reason: 'noSubject' })
    return finish()
  }
  const objects = objectActive ? table.alive(resolveSlot(objectSlot)) : []
  targets.object = objects
  if (objectActive && needsObject(actions) && objects.length === 0) {
    events.push({ type: 'fizzled', clause, reason: 'noObject' })
    return finish()
  }

  const subjectMods = collectSlotMods(subjectSlot, lookup, hooks.chainBoost)
  const objectMods = collectSlotMods(objectSlot, lookup, hooks.chainBoost)
  const adverbs = collectAdverbs(verbSlot, lookup, hooks)
  const poisonBonus = hooks.poisonBonus ?? 0
  const supportBonus = hooks.supportBonus ?? 0
  const scaled = (amount: number) => Math.floor(amount * adverbs.power)
  /** 피해 동작의 기본값: 층 배율(적)과 유물·그래서 보너스를 더한다. */
  const damageBase = (amount: number) => Math.round(amount * (hooks.damageScale ?? 1)) + (hooks.damageBonus ?? 0)

  /** 피해 한 번: 공격자 슬롯의 outgoing 수식과 피격자 슬롯의 incoming 수식을 적용한다. */
  const dealDamage = (sourceId: string, slotSourceMods: SlotMods, targetId: string, slotTargetMods: SlotMods, base: number) => {
    const sourceMods = mergeMods(slotSourceMods, context.lingering?.(sourceId) ?? NO_MODS)
    const targetMods = mergeMods(slotTargetMods, context.lingering?.(targetId) ?? NO_MODS)
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
      const poison = sourceMods.onHitPoison + poisonBonus
      table.update(targetId, (e) => addStatus(e, 'poison', poison))
      events.push({ type: 'statusApplied', entityId: targetId, status: 'poison', amount: poison })
    }
    return result.dealt
  }

  const applyAction = (subjectId: string, action: VerbAction) => {
    const targetsOf = (to: ActionTarget) => table.alive(to === 'subject' ? [subjectId] : objects)
    switch (action.kind) {
      case 'damage':
        for (const objectId of table.alive(objects)) {
          const dealt = dealDamage(subjectId, subjectMods, objectId, objectMods, damageBase(action.amount))
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
      case 'counter': {
        // 보호 합은 동작을 시작할 때 한 번 읽는다(목적어가 여럿이어도 같은 위력).
        const power = table.get(subjectId)?.statuses.block ?? 0
        for (const objectId of table.alive(objects)) dealDamage(subjectId, subjectMods, objectId, objectMods, damageBase(power))
        const subject = table.get(subjectId)
        if (subject) table.update(subjectId, () => removeAllBlock(subject).entity)
        return
      }
      case 'recall':
        recalls += action.amount
        return
      case 'mutualDamage':
        for (const objectId of table.alive(objects)) {
          // 내가 주는 피해에는 층 배율·유물 보너스가 붙고, 되받는 피해는 카드 수치 그대로다.
          dealDamage(subjectId, subjectMods, objectId, objectMods, damageBase(action.amount))
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
          const amount = scaled(action.amount + supportBonus)
          table.update(id, (e) => addBlock(e, amount, action.holds))
          events.push({ type: 'statusApplied', entityId: id, status: 'block', amount })
        }
        return
      case 'heal':
        for (const id of targetsOf(action.to)) {
          const target = table.get(id)
          if (!target) continue
          const result = heal(target, scaled(action.amount + supportBonus))
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
          const amount = action.amount + (action.status === 'poison' ? poisonBonus : 0)
          table.update(id, (e) => addStatus(e, action.status, amount))
          events.push({ type: 'statusApplied', entityId: id, status: action.status, amount })
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
