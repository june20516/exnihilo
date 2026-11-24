/** 손패 겹침 규칙(화면 표현 값, px). 카드 폭은 WordTile의 w-32와 같다. */
export const HAND_LAYOUT = {
  cardWidth: 128,
  /** 이 장수까지는 겹치지 않는다. */
  freeCards: 4,
  /** 그 뒤 한 장마다 늘어나는 겹침. */
  stepPx: 14,
  basePx: 18,
  /** 폭이 넉넉할 때의 겹침 상한. */
  maxRuleOverlap: 84,
  /** 아무리 좁아도 카드마다 이만큼은 보인다. */
  minVisible: 24,
} as const

/**
 * 이웃 카드와의 겹침 폭. 장수에 따른 규칙 값과, 남은 폭(available)에 다 들어가는 데 필요한 값 중 큰 쪽.
 * 카드마다 minVisible은 남긴다.
 */
export function overlapFor(count: number, available: number): number {
  const L = HAND_LAYOUT
  const rule = count <= L.freeCards ? 0 : Math.min(L.maxRuleOverlap, L.basePx + (count - L.freeCards) * L.stepPx)
  if (count <= 1) return 0
  const needed = Math.ceil((count * L.cardWidth - available) / (count - 1))
  return Math.min(L.cardWidth - L.minVisible, Math.max(rule, needed))
}
