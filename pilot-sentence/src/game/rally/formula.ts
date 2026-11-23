import { type Entity, scaleIncoming, scaleOutgoing, VULNERABLE_MULTIPLIER, WEAK_MULTIPLIER } from '@/kit/core/entity'
import { wordLookup } from '@/game/build/build'
import type { VerbAction } from '@/game/content/words'
import { adjectiveCount, CHAIN_FACTOR, collectAdverbs, collectSlotMods, resolveTargets } from '@/game/resolve/resolve'
import { type Board, getSlot } from '@/game/sentence/board'
import { type ClauseRun, materializeFor, type RallyState, runSentence } from './combat'
import { isBlank } from './sentence'

/** 계산식 문자열을 쌓는다. 곱하기 앞에 더하기가 있으면 괄호로 묶는다. 1이나 0인 항은 생략한다. */
class Expression {
  private text: string
  private pendingSum = false

  constructor(base: number) {
    this.text = String(base)
  }

  /** label이 있으면 `× 2(사슬)`처럼 붙인다. */
  times(factor: number, label = ''): this {
    if (factor === 1) return this
    const term = label ? `${factor}(${label})` : String(factor)
    this.text = this.pendingSum ? `(${this.text}) × ${term}` : `${this.text} × ${term}`
    this.pendingSum = false
    return this
  }

  plus(label: string, amount: number): this {
    if (amount === 0) return this
    this.text = `${this.text} + ${label}${amount}`
    this.pendingSum = true
    return this
  }

  minus(amount: number): this {
    if (amount === 0) return this
    this.text = `${this.text} − ${amount}`
    this.pendingSum = true
    return this
  }

  toString(): string {
    return this.text
  }
}

type AmountAction = Extract<VerbAction, { kind: 'damage' | 'block' | 'heal' | 'grow' | 'loseHp' }>

/** 보여 줄 동작: 첫 피해 동작, 없으면 첫 수치 동작. */
function pickAction(actions: readonly VerbAction[]): AmountAction | null {
  const damage = actions.find((a): a is Extract<VerbAction, { kind: 'damage' }> => a.kind === 'damage')
  if (damage) return damage
  return actions.find((a): a is AmountAction => a.kind === 'block' || a.kind === 'heal' || a.kind === 'grow' || a.kind === 'loseHp') ?? null
}

export interface ClauseFormula {
  readonly clause: number
  readonly text: string
  readonly value: number
}

/**
 * 절 하나의 계산식. 해석기와 같은 순서·같은 반올림 위치로 값을 계산한다.
 * 행위자는 주어의 첫 개체, 대상은 목적어의 첫 개체(이 절 실행 직전 상태). 반복이 있으면 1회분 값 뒤에 횟수를 붙인다.
 */
function clauseFormula(state: RallyState, board: Board, clause: number, run: ClauseRun): ClauseFormula | null {
  const lookup = wordLookup(state.build)
  const verbSlot = getSlot(board, { clause, role: 'verb' })
  const effect = lookup(verbSlot.head.wordId).effect
  if (effect.type !== 'verb') return null
  const action = pickAction(effect.actions)
  if (!action) return null

  const { hooks, soBonus } = run
  const relicBonus = (hooks.damageBonus ?? 0) - soBonus
  const adverbs = collectAdverbs(verbSlot, lookup, hooks)
  const repeat = adverbs.repeat > 1 ? ` (×${adverbs.repeat}회)` : ''

  if (action.kind !== 'damage') {
    const bonus = action.kind === 'block' || action.kind === 'heal' ? (hooks.supportBonus ?? 0) : 0
    const value = Math.floor((action.amount + bonus) * adverbs.power)
    return { clause, text: `${new Expression(action.amount).plus('유물 ', bonus).times(adverbs.power)} = ${value}${repeat}`, value }
  }

  const entities = run.entitiesBefore
  const subjectSlot = getSlot(board, { clause, role: 'subject' })
  const objectSlot = getSlot(board, { clause, role: 'object' })
  const firstEntity = (slot: typeof subjectSlot): Entity | undefined =>
    entities.find((e) => e.id === resolveTargets(slot.head, entities, lookup).ids[0])
  const source = firstEntity(subjectSlot)
  const target = firstEntity(objectSlot)
  // 사슬 배율은 식에 따로 보이도록 슬롯 배율과 나눠 계산한다.
  const sourceMods = collectSlotMods(subjectSlot, lookup)
  const targetMods = collectSlotMods(objectSlot, lookup)
  const chainOf = (slot: typeof subjectSlot) => (hooks.chainBoost && adjectiveCount(slot, lookup) >= 2 ? CHAIN_FACTOR : 1)
  const sourceChain = chainOf(subjectSlot)
  const targetChain = chainOf(objectSlot)
  const base = action.amount + (hooks.damageBonus ?? 0)
  const bonus = adverbs.executionBonus ? run.executionsBefore : 0
  const strength = source?.statuses.strength ?? 0
  const weak = (source?.statuses.weak ?? 0) > 0 ? WEAK_MULTIPLIER : 1
  const vulnerable = (target?.statuses.vulnerable ?? 0) > 0 ? VULNERABLE_MULTIPLIER : 1

  const powered = base * adverbs.power + bonus
  const outgoing = ((source ? scaleOutgoing(powered, source) : powered) + sourceMods.outgoingFlat) * sourceMods.outgoingMul * sourceChain
  const incoming = (target ? scaleIncoming(outgoing, target) : outgoing) * targetMods.incomingMul * targetChain
  const value = Math.max(0, Math.floor(incoming) - targetMods.incomingFlat)

  const text = new Expression(action.amount)
    .plus('유물 ', relicBonus)
    .plus('그래서 ', soBonus)
    .times(adverbs.power)
    .plus('거듭 ', bonus)
    .plus('힘 ', strength)
    .times(weak, '약화')
    .plus('', sourceMods.outgoingFlat)
    .times(sourceMods.outgoingMul)
    .times(sourceChain, '사슬')
    .times(vulnerable, '취약')
    .times(targetMods.incomingMul)
    .times(targetChain, '사슬')
    .minus(targetMods.incomingFlat)
  // 미리보기의 피해는 적의 남은 HP에서 잘린다. 계산식 값이 그 이상이면 처치임을 밝혀 두 숫자가 왜 다른지 보인다.
  const remaining = target ? target.hp + target.statuses.block : Number.POSITIVE_INFINITY
  const lethal = target && target.side === 'enemy' && value * adverbs.repeat >= remaining ? ` → 처치(남은 HP ${target.hp})` : ''
  return { clause, text: `${text} = ${value}${repeat}${lethal}`, value }
}

/** 내 문장의 계산식: 동사가 놓인 절마다 한 줄(spec §2.3, 런 spec §4.1). */
export function sentenceFormula(state: RallyState): ClauseFormula[] {
  const board = materializeFor(state)
  const { clauses } = runSentence(state)
  return board.clauses.flatMap((_, clause) => {
    const run = clauses[clause]
    if (!run || isBlank(getSlot(state.board, { clause, role: 'verb' }).head)) return []
    const formula = clauseFormula(state, board, clause, run)
    return formula ? [formula] : []
  })
}
