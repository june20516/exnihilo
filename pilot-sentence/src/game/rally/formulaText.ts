import { type ClauseCalc, type FizzleCause, type FormulaLabel, sentenceCalc } from './formula'
import type { RallyState } from './combat'

/** 계산식의 문구 부분: formula.ts의 항 목록을 사람이 읽는 식으로 바꾼다. */

const PLUS_LABELS: Record<Exclude<FormulaLabel, null>, string> = {
  relic: '유물 ', so: '그래서 ', again: '거듭 ', strength: '힘 ', weak: '', chain: '', vulnerable: '',
}
const TIMES_LABELS: Record<Exclude<FormulaLabel, null>, string> = {
  relic: '유물', so: '그래서', again: '거듭', strength: '힘', weak: '약화', chain: '사슬', vulnerable: '취약',
}
const FIZZLE_TEXT: Record<FizzleCause, string> = { noObject: '무효(대상 없음)', frozen: '무효(빙결)' }

/** 식 문자열을 쌓는다. 곱하기 앞에 더하기가 있으면 괄호로 묶는다. 1이나 0인 항은 생략한다. */
function expression(calc: ClauseCalc): string {
  let text = String(calc.base)
  let pendingSum = false
  for (const term of calc.terms) {
    if (term.kind === 'plus') {
      if (term.amount === 0) continue
      text = `${text} + ${term.label ? PLUS_LABELS[term.label] : ''}${term.amount}`
      pendingSum = true
    } else if (term.kind === 'minus') {
      if (term.amount === 0) continue
      text = `${text} − ${term.amount}`
      pendingSum = true
    } else {
      if (term.factor === 1) continue
      const factor = term.label ? `${term.factor}(${TIMES_LABELS[term.label]})` : String(term.factor)
      text = pendingSum ? `(${text}) × ${factor}` : `${text} × ${factor}`
      pendingSum = false
    }
  }
  return text
}

export function formulaText(calc: ClauseCalc): string {
  if (calc.fizzle) return FIZZLE_TEXT[calc.fizzle]
  const repeat = calc.repeat > 1 ? ` (×${calc.repeat}회)` : ''
  const lethal = calc.lethalHp !== null ? ` → 처치(남은 HP ${calc.lethalHp})` : ''
  return `${expression(calc)} = ${calc.value}${repeat}${lethal}`
}

export interface ClauseFormula {
  readonly clause: number
  readonly text: string
  readonly value: number
}

/** 내 문장의 계산식: 동사가 놓인 절마다 한 줄. */
export function sentenceFormula(state: RallyState): ClauseFormula[] {
  return sentenceCalc(state).map((calc) => ({ clause: calc.clause, text: formulaText(calc), value: calc.value }))
}
