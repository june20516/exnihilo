/** 공통 수치. 카드 경제 규칙 값은 rally/combat.ts의 RALLY_RULES에 있다. */
export const BALANCE = {
  playerMaxHp: 60,
  maxModifiers: 2,
} as const

export type Balance = { readonly [K in keyof typeof BALANCE]: number }
