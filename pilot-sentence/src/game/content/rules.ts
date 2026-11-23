/** 카드 경제 구조의 선택지 (spec 10.1). 프리셋으로 바꿔 가며 비교한다. */
export type ResourceRule =
  | { readonly mode: 'fixed'; readonly perTurn: number }
  | { readonly mode: 'ramp'; readonly start: number; readonly max: number }
  | { readonly mode: 'ink'; readonly regen: number; readonly max: number; readonly start: number }

export type PresetId = 'A' | 'B' | 'C'

/** 흉조(적 개입)를 언제, 얼마나 자주 적용하는가. */
export interface OmenRule {
  /** beforeExecution: 이번 턴의 모든 실행(플레이어 낭독 포함)보다 먼저 / afterExecution: 모든 실행이 끝난 뒤 */
  readonly timing: 'beforeExecution' | 'afterExecution'
  /** N턴마다 한 번 착탄한다(1이면 매 턴). */
  readonly every: number
}

export type OmenVariantId = 'pre1' | 'post1' | 'pre2' | 'post2'

export const OMEN_VARIANTS: Record<OmenVariantId, { readonly name: string; readonly rule: OmenRule }> = {
  pre1: { name: '실행 전·매 턴', rule: { timing: 'beforeExecution', every: 1 } },
  post1: { name: '실행 후·매 턴', rule: { timing: 'afterExecution', every: 1 } },
  pre2: { name: '실행 전·2턴마다', rule: { timing: 'beforeExecution', every: 2 } },
  post2: { name: '실행 후·2턴마다', rule: { timing: 'afterExecution', every: 2 } },
}

export interface RuleConfig {
  readonly id: PresetId
  readonly name: string
  readonly handCarry: 'discard' | 'keep'
  readonly handMax: number
  readonly startHand: number
  readonly autoDraw: number
  /** null이면 추가 드로우 불가. */
  readonly paidDrawCost: number | null
  readonly resource: ResourceRule
  /** dry: 실행 2회 후 마름 / permanent: 적이 지울 때까지 / untilCast: 낭독되면 소비 */
  readonly persistence: 'dry' | 'permanent' | 'untilCast'
  /** auto: 매 턴 끝 실행 / cast: 낭독할 때만 실행 */
  readonly execution: 'auto' | 'cast'
  /** 뒤바꾸기(주어↔목적어) 횟수 제한과 비용. 봉인된 슬롯은 뒤바꿀 수 없다. */
  readonly swapsPerTurn: number
  readonly swapCost: number
  readonly omen: OmenRule
}

export const PRESETS: Record<PresetId, RuleConfig> = {
  A: {
    id: 'A',
    name: 'StS형',
    handCarry: 'discard',
    handMax: 10,
    startHand: 4,
    autoDraw: 4,
    paidDrawCost: null,
    resource: { mode: 'fixed', perTurn: 3 },
    persistence: 'dry',
    execution: 'auto',
    swapsPerTurn: 1,
    swapCost: 0,
    omen: OMEN_VARIANTS.pre1.rule,
  },
  B: {
    id: 'B',
    name: '하스스톤형',
    handCarry: 'keep',
    handMax: 7,
    startHand: 4,
    autoDraw: 1,
    paidDrawCost: null,
    resource: { mode: 'ramp', start: 1, max: 6 },
    persistence: 'permanent',
    execution: 'auto',
    swapsPerTurn: 1,
    swapCost: 0,
    omen: OMEN_VARIANTS.pre1.rule,
  },
  C: {
    id: 'C',
    name: '잉크·낭독형',
    handCarry: 'keep',
    handMax: 7,
    startHand: 4,
    autoDraw: 1,
    paidDrawCost: 1,
    resource: { mode: 'ink', regen: 3, max: 8, start: 3 },
    persistence: 'untilCast',
    execution: 'cast',
    swapsPerTurn: 1,
    swapCost: 0,
    omen: OMEN_VARIANTS.pre1.rule,
  },
}
