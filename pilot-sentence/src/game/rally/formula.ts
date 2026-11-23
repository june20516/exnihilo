import { type Entity, scaleIncoming, scaleOutgoing } from '@/kit/core/entity'
import { getWord, type VerbAction } from '@/game/content/words'
import { collectAdverbs, collectSlotMods, resolveTargets } from '@/game/resolve/resolve'
import { getSlot } from '@/game/sentence/board'
import type { RallyState } from './combat'
import { hasVerb, materialize } from './sentence'

const WEAK_MULTIPLIER = 0.75
const VULNERABLE_MULTIPLIER = 1.5

/** 계산식 문자열을 쌓는다. 곱하기 앞에 더하기가 있으면 괄호로 묶는다. 1이나 0인 항은 생략한다. */
class Expression {
  private text: string
  private pendingSum = false

  constructor(base: number) {
    this.text = String(base)
  }

  times(factor: number): this {
    if (factor === 1) return this
    this.text = this.pendingSum ? `(${this.text}) × ${factor}` : `${this.text} × ${factor}`
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

/**
 * 내 문장의 계산식 한 줄(spec §2.3). 해석기와 같은 순서·같은 반올림 위치로 값을 계산한다.
 * 행위자는 주어의 첫 개체, 대상은 목적어의 첫 개체. 반복이 있으면 1회분 값 뒤에 횟수를 붙인다.
 */
export function sentenceFormula(state: RallyState): { text: string; value: number } | null {
  if (!hasVerb(state.board)) return null
  const board = materialize(state.board, state.targetId)
  const verbSlot = getSlot(board, { clause: 0, role: 'verb' })
  const effect = getWord(verbSlot.head.wordId).effect
  if (effect.type !== 'verb') return null
  const action = pickAction(effect.actions)
  if (!action) return null

  const adverbs = collectAdverbs(verbSlot)
  const repeat = adverbs.repeat > 1 ? ` (×${adverbs.repeat}회)` : ''

  if (action.kind !== 'damage') {
    const value = Math.floor(action.amount * adverbs.power)
    return { text: `${new Expression(action.amount).times(adverbs.power)} = ${value}${repeat}`, value }
  }

  const subjectSlot = getSlot(board, { clause: 0, role: 'subject' })
  const objectSlot = getSlot(board, { clause: 0, role: 'object' })
  const firstEntity = (slot: typeof subjectSlot): Entity | undefined =>
    state.entities.find((e) => e.id === resolveTargets(slot.head, state.entities).ids[0])
  const source = firstEntity(subjectSlot)
  const target = firstEntity(objectSlot)
  const sourceMods = collectSlotMods(subjectSlot)
  const targetMods = collectSlotMods(objectSlot)
  const bonus = adverbs.executionBonus ? state.executions : 0
  const strength = source?.statuses.strength ?? 0
  const weak = (source?.statuses.weak ?? 0) > 0 ? WEAK_MULTIPLIER : 1
  const vulnerable = (target?.statuses.vulnerable ?? 0) > 0 ? VULNERABLE_MULTIPLIER : 1

  const powered = action.amount * adverbs.power + bonus
  const outgoing = ((source ? scaleOutgoing(powered, source) : powered) + sourceMods.outgoingFlat) * sourceMods.outgoingMul
  const value = Math.max(0, Math.floor((target ? scaleIncoming(outgoing, target) : outgoing) * targetMods.incomingMul) - targetMods.incomingFlat)

  const text = new Expression(action.amount)
    .times(adverbs.power)
    .plus('거듭 ', bonus)
    .plus('힘 ', strength)
    .times(weak)
    .plus('', sourceMods.outgoingFlat)
    .times(sourceMods.outgoingMul)
    .times(vulnerable)
    .times(targetMods.incomingMul)
    .minus(targetMods.incomingFlat)
  return { text: `${text} = ${value}${repeat}`, value }
}
