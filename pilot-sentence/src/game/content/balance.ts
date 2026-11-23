/** 프리셋과 무관한 공통 수치. (카드 경제 수치는 rules.ts의 프리셋에 있다) */
export const BALANCE = {
  playerMaxHp: 60,
  maxModifiers: 2,
  sealExtraCost: 1,
} as const

export type Balance = { readonly [K in keyof typeof BALANCE]: number }
