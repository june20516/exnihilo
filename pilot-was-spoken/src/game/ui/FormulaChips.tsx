import type { ClauseCalc, FormulaTerm } from '@/game/rally/formula'
import { FIZZLE_TEXT, TIMES_LABELS } from '@/game/rally/formulaText'

/** 식에서 생략하는 항: 더하기 0, 곱하기 1, 빼기 0(formulaText와 같은 규칙). */
function isIdentity(term: FormulaTerm): boolean {
  return term.kind === 'times' ? term.factor === 1 : term.amount === 0
}

/** 항의 이름: 출처(단어·유물·상태 이름)가 있으면 그것, 없으면 항 종류의 기본 이름. */
function termName(term: FormulaTerm): string {
  if (term.sources.length > 0) return term.sources.join('·')
  return term.kind !== 'minus' && term.label ? TIMES_LABELS[term.label] : ''
}

function termValue(term: FormulaTerm): string {
  if (term.kind === 'times') return `×${term.factor}`
  return term.kind === 'plus' ? `+${term.amount}` : `−${term.amount}`
}

/**
 * 계산식: 항을 계산 순서대로 칩으로 보인다(왼쪽부터 차례로 적용하면 결과가 된다). 결과 숫자는 크게.
 * 반복·처치·무효 표시는 문구 계산식과 같다.
 */
export function FormulaChips({ calcs, placeholder }: { calcs: readonly ClauseCalc[]; placeholder: string }) {
  if (calcs.length === 0) return <p className="text-center font-ui text-sm text-on-surface-variant">{placeholder}</p>
  return (
    <div className="flex flex-col items-center gap-1">
      {calcs.map((calc) => (
        <div key={calc.clause} data-clause={calc.clause} className="flex flex-wrap items-center justify-center gap-1 font-ui text-sm">
          {calcs.length > 1 && <span className="text-[11px] text-outline">절 {calc.clause + 1}</span>}
          {calc.fizzle ? (
            <span className="rounded bg-surface-container-high px-2 py-0.5 text-on-surface-variant">{FIZZLE_TEXT[calc.fizzle]}</span>
          ) : (
            <>
              <span className="rounded bg-surface-container-high px-2 py-0.5">
                {calc.baseSource} <b className="font-number text-base">{calc.base}</b>
              </span>
              {calc.terms.filter((t) => !isIdentity(t)).map((term, i) => (
                <span key={i} data-testid="formula-term" className="rounded bg-secondary/15 px-2 py-0.5 text-secondary">
                  {termName(term)} <b className="font-number text-base">{termValue(term)}</b>
                </span>
              ))}
              <span data-testid="formula-result" className="font-number text-2xl text-secondary">
                = {calc.value}
              </span>
              {calc.repeat > 1 && (
                <span className="text-xs text-on-surface-variant">
                  {calc.laterValue !== null ? `(이후 ${calc.repeat - 1}회는 ${calc.laterValue})` : `(×${calc.repeat}회)`}
                </span>
              )}
              {calc.lethalHp !== null && <span className="rounded bg-error-container px-2 py-0.5 text-xs text-on-error-container">처치 (남은 HP {calc.lethalHp})</span>}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
