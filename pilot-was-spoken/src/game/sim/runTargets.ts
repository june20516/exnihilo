/** 런 게이트 목표 (런 spec §7.2). [최소, 최대] */
export const RUN_TARGETS = {
  learnedWinRate: [0.5, 0.8],
  /** 무작위 구매 완주율은 학습 봇보다 이만큼 이상 낮아야 한다. */
  randomGap: 0.2,
  noShopMaxWinRate: 0.2,
  /** 학습 봇과 이 차이 안에 드는 유형 수가 minArchetypes 이상. */
  archetypeGap: 0.15,
  minArchetypes: 3,
  /** 학습 봇 상위 25% 런의 최대 한 방. */
  topQuartileBurst: 180,
  /** 정예·보스 전투의 평균 턴 상한. */
  eliteMaxTurns: 8,
  /** 학습 봇 완주율 − 때리기만 하는 봇 완주율의 하한(v3 결정 구조 판정). */
  attackOnlyGap: 0.2,
} as const
