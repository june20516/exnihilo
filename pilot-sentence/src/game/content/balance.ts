/**
 * 규칙 수치(손잡이)의 집. 밸런스 조절은 여기와 콘텐츠 표(단어·유물·적·층·캐릭터)의 값만 고친다.
 * 로직 안에 숫자를 직접 쓰지 않는다.
 */

/** 공통 수치. */
export const BALANCE = {
  playerMaxHp: 60,
} as const

export type Balance = { readonly [K in keyof typeof BALANCE]: number }

/** 강화 규칙: 단계마다 수치가 어떻게 오르는가(build.ts effectiveWord). */
export const UPGRADE_RULES = {
  /** 동사 수치(피해·보호·회복 등)는 단계마다 ×amountMul, 각 단계에서 반올림. */
  amountMul: 1.5,
  /** 배율(1 이상)은 단계마다 +mulStep. 1보다 작은 약화 배율은 그대로. */
  mulStep: 0.5,
  /** 주는·받는 가산은 단계마다 +flatStep. */
  flatStep: 3,
  /** 맞힐 때 독은 단계마다 +poisonStep. */
  poisonStep: 1,
  /** 최대 강화 단계. */
  maxLevel: 2,
} as const

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
