import { STATUS_NAMES } from '@/game/content/statuses'
import { type Entity, scaleIncoming, scaleOutgoing, VULNERABLE_MULTIPLIER, WEAK_MULTIPLIER } from '@/kit/core/entity'
import { wordLookup } from '@/game/build/build'
import { RELICS, type RelicEffect } from '@/game/build/relics'
import type { VerbAction, WordDef, WordId } from '@/game/content/words'
import { chainFactorOf, collectAdverbs, collectSlotMods, resolveTargets } from '@/game/resolve/resolve'
import { type Board, getSlot } from '@/game/sentence/board'
import { type ClauseRun, type RallyState, runSentence } from './combat'
import { materializeFor } from './hooks'
import { isBlank } from './sentence'

/**
 * 계산식의 계산 부분: 절마다 해석기와 같은 순서·같은 반올림 위치로 값을 내고, 식을 이루는 항을 돌려준다.
 * 문구로 바꾸는 일은 formulaText.ts가 맡는다.
 */

/** 식의 항. 항 순서가 곧 계산 순서다. label은 무엇에서 온 항인지(유물, 사슬, 약화 등). */
export type FormulaTerm =
  | { readonly kind: 'plus'; readonly amount: number; readonly label: FormulaLabel; readonly sources: readonly string[] }
  | { readonly kind: 'times'; readonly factor: number; readonly label: FormulaLabel; readonly sources: readonly string[] }
  | { readonly kind: 'minus'; readonly amount: number; readonly sources: readonly string[] }

export type FormulaLabel = 'relic' | 'so' | 'again' | 'strength' | 'weak' | 'chain' | 'vulnerable' | null

/** 실행해도 아무 일이 없는 절의 이유. */
export type FizzleCause = 'noObject' | 'frozen'

export interface ClauseCalc {
  readonly clause: number
  /** 카드의 기본 수치(식의 첫 항). 되받아친다는 주어의 보호 합. */
  readonly base: number
  /** 기본 수치가 카드 수치가 아니라 다른 값일 때 그 이름. 'block'이면 보호 합. */
  readonly baseLabel: 'block' | null
  /** 기본 수치의 출처 이름: 동사 문구, 되받아친다면 '보호'. */
  readonly baseSource: string
  readonly terms: readonly FormulaTerm[]
  /** 1회분 값. 무효면 0. */
  readonly value: number
  /** 둘째 반복부터의 1회분 값이 첫 값과 다르면 그 값(되받아친다: 보호를 다 쓴 뒤라 보호 0). 같으면 null. */
  readonly laterValue: number | null
  readonly repeat: number
  /** 값(반복 포함)이 대상 적의 남은 HP 이상이면 그 남은 HP. */
  readonly lethalHp: number | null
  readonly fizzle: FizzleCause | null
}

type DamageAction = Extract<VerbAction, { kind: 'damage' | 'mutualDamage' | 'counter' }>
type AmountAction = DamageAction | Extract<VerbAction, { kind: 'block' | 'heal' | 'grow' | 'loseHp' }>

/** 보여 줄 동작: 첫 피해 동작(끌어안는다의 내 쪽 피해 포함), 없으면 첫 수치 동작. */
function pickAction(actions: readonly VerbAction[]): AmountAction | null {
  const damage = actions.find((a): a is DamageAction => a.kind === 'damage' || a.kind === 'mutualDamage' || a.kind === 'counter')
  if (damage) return damage
  return actions.find((a): a is AmountAction => a.kind === 'block' || a.kind === 'heal' || a.kind === 'grow' || a.kind === 'loseHp') ?? null
}

/**
 * 절 하나의 계산. 행위자는 주어의 첫 개체, 대상은 목적어의 첫 개체(이 절 실행 직전 상태).
 * 해석기처럼, 주어가 얼어 있으면(기어이 없이) 빙결로, 피해 대상이 이미 쓰러졌으면 대상 없음으로 무효다.
 */
function clauseCalc(state: RallyState, board: Board, clause: number, run: ClauseRun): ClauseCalc | null {
  const lookup = wordLookup(state.build)
  const verbSlot = getSlot(board, { clause, role: 'verb' })
  const effect = lookup(verbSlot.head.wordId).effect
  if (effect.type !== 'verb') return null
  const action = pickAction(effect.actions)
  if (!action) return null

  const { hooks, soBonus } = run
  const adverbs = collectAdverbs(verbSlot, lookup, hooks)
  const entities = run.entitiesBefore
  const subjectSlot = getSlot(board, { clause, role: 'subject' })
  const objectSlot = getSlot(board, { clause, role: 'object' })
  const firstEntity = (slot: typeof subjectSlot): Entity | undefined =>
    entities.find((e) => e.id === resolveTargets(slot.head, entities, lookup).ids[0])
  const source = firstEntity(subjectSlot)
  const target = firstEntity(objectSlot)
  // 되받아친다의 위력은 카드 수치가 아니라 주어의 보호 합이다(해석기와 같은 시점의 값).
  const baseLabel = action.kind === 'counter' ? 'block' : null
  const baseAmount = action.kind === 'counter' ? (source?.statuses.block ?? 0) : action.amount
  const baseSource = action.kind === 'counter' ? '보호' : lookup(verbSlot.head.wordId).text
  const sources = termSources(state, board, clause, lookup)
  const fizzled = (fizzle: FizzleCause): ClauseCalc => ({ clause, base: baseAmount, baseLabel, baseSource, terms: [], value: 0, laterValue: null, repeat: adverbs.repeat, lethalHp: null, fizzle })
  if (source && source.statuses.freeze > 0 && !adverbs.ignoreFreeze) return fizzled('frozen')

  if (action.kind !== 'damage' && action.kind !== 'mutualDamage' && action.kind !== 'counter') {
    const bonus = action.kind === 'block' || action.kind === 'heal' ? (hooks.supportBonus ?? 0) : 0
    const value = Math.floor((action.amount + bonus) * adverbs.power)
    const terms: FormulaTerm[] = [
      { kind: 'plus', amount: bonus, label: 'relic', sources: sources.supportRelics },
      { kind: 'times', factor: adverbs.power, label: null, sources: sources.adverbs },
    ]
    return { clause, base: action.amount, baseLabel, baseSource, terms, value, laterValue: null, repeat: adverbs.repeat, lethalHp: null, fizzle: null }
  }

  if (!target || target.hp <= 0) return fizzled('noObject')
  // 사슬 배율은 식에 따로 보이도록 슬롯 배율과 나눠 계산한다.
  const sourceMods = collectSlotMods(subjectSlot, lookup)
  const targetMods = collectSlotMods(objectSlot, lookup)
  const chainOf = (slot: typeof subjectSlot) => chainFactorOf(slot, lookup, hooks.chainBoost)
  const sourceChain = chainOf(subjectSlot)
  const targetChain = chainOf(objectSlot)
  const executionBonus = adverbs.executionBonus ? run.executionsBefore : 0
  const strength = source?.statuses.strength ?? 0
  const weak = (source?.statuses.weak ?? 0) > 0 ? WEAK_MULTIPLIER : 1
  const vulnerable = target.statuses.vulnerable > 0 ? VULNERABLE_MULTIPLIER : 1

  /** 기본 수치 하나에 대한 1회분 값(해석기와 같은 순서·같은 반올림 위치). */
  const valueFor = (amount: number): number => {
    const powered = (amount + (hooks.damageBonus ?? 0)) * adverbs.power + executionBonus
    const outgoing = ((source ? scaleOutgoing(powered, source) : powered) + sourceMods.outgoingFlat) * sourceMods.outgoingMul * sourceChain
    const incoming = scaleIncoming(outgoing, target) * targetMods.incomingMul * targetChain
    return Math.max(0, Math.floor(incoming) - targetMods.incomingFlat)
  }
  const value = valueFor(baseAmount)
  // 되받아친다는 첫 반복이 보호를 모두 쓰므로, 이후 반복의 위력은 보호 0이다.
  const laterValue = action.kind === 'counter' ? valueFor(0) : null
  const total = value + (laterValue ?? value) * (adverbs.repeat - 1)

  const terms: FormulaTerm[] = [
    { kind: 'plus', amount: (hooks.damageBonus ?? 0) - soBonus, label: 'relic', sources: sources.damageRelics },
    { kind: 'plus', amount: soBonus, label: 'so', sources: sources.connective },
    { kind: 'times', factor: adverbs.power, label: null, sources: sources.adverbs },
    { kind: 'plus', amount: executionBonus, label: 'again', sources: sources.againAdverbs },
    { kind: 'plus', amount: strength, label: 'strength', sources: [STATUS_NAMES.strength] },
    { kind: 'times', factor: weak, label: 'weak', sources: [STATUS_NAMES.weak] },
    { kind: 'plus', amount: sourceMods.outgoingFlat, label: null, sources: sources.subjectAdjectives },
    { kind: 'times', factor: sourceMods.outgoingMul, label: null, sources: sources.subjectAdjectives },
    { kind: 'times', factor: sourceChain, label: 'chain', sources: sources.chainRelics },
    { kind: 'times', factor: vulnerable, label: 'vulnerable', sources: [STATUS_NAMES.vulnerable] },
    { kind: 'times', factor: targetMods.incomingMul, label: null, sources: sources.objectAdjectives },
    { kind: 'times', factor: targetChain, label: 'chain', sources: sources.chainRelics },
    { kind: 'minus', amount: targetMods.incomingFlat, sources: sources.objectAdjectives },
  ]
  // 미리보기의 피해는 적의 남은 HP에서 잘린다. 값이 그 이상이면 처치임을 밝혀 두 숫자가 왜 다른지 보인다.
  const lethalHp = target.side === 'enemy' && total >= target.hp + target.statuses.block ? target.hp : null
  return { clause, base: baseAmount, baseLabel, baseSource, terms, value, laterValue, repeat: adverbs.repeat, lethalHp, fizzle: null }
}

/** 계산식 항의 출처 이름들(칸의 수식어 문구, 가진 유물 이름). */
function termSources(state: RallyState, board: Board, clause: number, lookup: (id: WordId) => WordDef) {
  const texts = (role: 'subject' | 'object' | 'verb', kind: 'adjective' | 'adverb', keep: (def: WordDef) => boolean = () => true) =>
    getSlot(board, { clause, role }).modifiers.flatMap((m) => {
      if (!m) return []
      const def = lookup(m.wordId)
      return def.kind === kind && keep(def) ? [def.text] : []
    })
  const relicsWith = (kinds: readonly RelicEffect['kind'][]) =>
    state.build.relics.filter((id) => kinds.includes(RELICS[id].effect.kind)).map((id) => RELICS[id].name)
  const subjectBlank = isBlank(getSlot(state.board, { clause, role: 'subject' }).head)
  const isAgain = (def: WordDef) => def.effect.type === 'adverb' && def.effect.mods.some((m) => m.kind === 'executionBonus')
  return {
    adverbs: texts('verb', 'adverb', (def) => !isAgain(def)),
    againAdverbs: texts('verb', 'adverb', isAgain),
    subjectAdjectives: texts('subject', 'adjective'),
    objectAdjectives: texts('object', 'adjective'),
    damageRelics: relicsWith(subjectBlank ? ['perWordBonus', 'blankSubjectBonus'] : ['perWordBonus']),
    supportRelics: relicsWith(['perWordBonus']),
    chainRelics: relicsWith(['chainBoost']),
    connective: state.connective ? [lookup(state.connective.wordId).text] : [],
  }
}

/** 내 문장의 계산: 동사가 놓인 절마다 하나(spec §2.3, 런 spec §4.1). */
export function sentenceCalc(state: RallyState): ClauseCalc[] {
  const board = materializeFor(state)
  const { clauses } = runSentence(state)
  return board.clauses.flatMap((_, clause) => {
    const run = clauses[clause]
    if (!run || isBlank(getSlot(state.board, { clause, role: 'verb' }).head)) return []
    const calc = clauseCalc(state, board, clause, run)
    return calc ? [calc] : []
  })
}
