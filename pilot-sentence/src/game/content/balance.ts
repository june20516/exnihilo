import type { EncounterTier } from './enemies'
import type { Rarity } from './words'

/**
 * 규칙 수치(손잡이)의 집. 밸런스 조절은 여기와 콘텐츠 표(단어·유물·적·층·캐릭터)의 값만 고친다.
 * 로직 안에 숫자를 직접 쓰지 않는다.
 */

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
  /** 플레이어 최대 HP(임시: 캐릭터 정의로 옮긴다, Plan 7 Task 5). */
  playerMaxHp: 60,
  /** 서고가 바닥났을 때 뽑지 못한 카드 한 장마다 잃는 HP(보호·피해 감소 무시). */
  emptyDrawHpLoss: 2,
  /** 그래서: 앞 절에서 적이 받은 피해 중 다음 절 기본값에 더하는 비율. */
  soRatio: 0.5,
  /** 적 예고 문장의 수식어 칸 수(내 빌드와 무관). */
  enemyModifierSlots: 2,
  /** 내 문장 한 칸의 수식어 칸 최대치. */
  maxSlots: 4,
} as const

/** 런 규칙(런 spec §1·§2). 층 구성과 층 배율은 콘텐츠 표 run/floors.ts에 있다. */
export const RUN_RULES = {
  /** 조우 등급별 승리 화폐. */
  rewardGold: { normal: 25, elite: 40, boss: 0 } satisfies Readonly<Record<EncounterTier, number>>,
  /** 층을 넘길 때 회복하는 최대 HP 비율. */
  healRatio: 0.2,
} as const

/** 상점 규칙(런 spec §3). */
export const SHOP_RULES = {
  /** 종류별 기본 값. */
  basePrice: { word: 6, upgrade: 8, structure: 12, relic: 15 },
  /** 희귀도별 값 보정. */
  rarityAdjust: { starter: -3, common: -3, uncommon: 0, rare: 3 } satisfies Readonly<Record<Rarity, number>>,
  /** 희귀도별 단어 보상 가중치. */
  rarityWeight: { starter: 60, common: 60, uncommon: 30, rare: 10 } satisfies Readonly<Record<Rarity, number>>,
  /** 조합 재료(형용사·부사·연결어)의 단어 보상 가중치 배율. 빌드 레이어를 런마다 겪게 하려는 보정. */
  materialWeight: 3,
  /** 하나를 사면 남은 상품 값에 곱하는 배율(올림). */
  priceGrowth: 1.5,
  /** 상점 상품 수. */
  size: 3,
} as const
