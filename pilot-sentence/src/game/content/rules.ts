/** 카드 경제 구조의 선택지 (spec 10.1). 프리셋으로 바꿔 가며 비교한다. */
export type ResourceRule =
  | { readonly mode: 'fixed'; readonly perTurn: number }
  | { readonly mode: 'ramp'; readonly start: number; readonly max: number }
  | { readonly mode: 'ink'; readonly regen: number; readonly max: number; readonly start: number }

export type PresetId = 'A' | 'B' | 'C'

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
  readonly freeSwapsPerTurn: number
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
    freeSwapsPerTurn: 1,
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
    freeSwapsPerTurn: 1,
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
    freeSwapsPerTurn: 1,
  },
}
