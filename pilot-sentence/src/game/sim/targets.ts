/** 기본 규칙 게이트의 목표 범위 (v2 spec §7). [최소, 최대] */
export const BALANCE_TARGETS = {
  /** 상한 없음: 예고형 전투는 거의 이기는 것이 자연스럽고, 긴장은 HP 손실로 잰다(지는 압박은 런 단위). */
  greedyWinRate: [0.8, 1],
  greedyHpLostOnWin: [10, 30],
  avgTurns: [4, 7],
  maxDeadTurnRate: 0.05,
  defendRate: [0.2, 0.6],
  /** 무작위 봇 승률은 탐욕 봇보다 이만큼 이상 낮아야 한다. */
  minGreedyEdge: 0.2,
} as const
