/** 일반 조우의 기계 검증 목표 범위 (spec 9.3). [최소, 최대] */
export const BALANCE_TARGETS = {
  greedyWinRate: [0.6, 0.85],
  greedyHpLostOnWin: [15, 35],
  passiveWinRate: [0, 0],
} as const
