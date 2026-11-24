/**
 * 규칙 수치(손잡이)의 집. 밸런스 조절은 여기와 콘텐츠 표(단어·유물·적·층·캐릭터)의 값만 고친다.
 * 로직 안에 숫자를 직접 쓰지 않는다.
 */

/** 공통 수치. */
export const BALANCE = {
  playerMaxHp: 60,
} as const

export type Balance = { readonly [K in keyof typeof BALANCE]: number }

/** 전투 규칙. */
export const RALLY_RULES = {
  /** 첫 턴 드로우 수. */
  startHand: 6,
  /** 이후 턴마다 드로우 수. */
  drawPerTurn: 5,
  /** 그래서: 앞 절에서 적이 받은 피해 중 다음 절 기본값에 더하는 비율. */
  soRatio: 0.5,
  /** 적 예고 문장의 수식어 칸 수(내 빌드와 무관). */
  enemyModifierSlots: 2,
  /** 내 문장 한 칸의 수식어 칸 최대치. */
  maxSlots: 4,
} as const
