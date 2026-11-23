/** 모든 조정 가능한 수치. (spec 1.9) */
export const BALANCE = {
  playerMaxHp: 60,
  apPerTurn: 3,
  drawPerTurn: 4,
  maxModifiers: 2,
  sealExtraCost: 1,
} as const

export type Balance = { readonly [K in keyof typeof BALANCE]: number }
