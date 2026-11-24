/** 손패 겹침 규칙(화면 표현 값, px). 카드 폭은 WordTile의 w-32와 같다. */
export const HAND_LAYOUT = {
  cardWidth: 128,
  /** 아무리 좁아도 카드마다 이만큼은 보인다. */
  minVisible: 24,
} as const

/**
 * 이웃 카드와의 겹침 폭. 남은 폭(available)에 다 들어가면 겹치지 않고, 모자라면 다 들어가는 만큼만 겹친다.
 * 카드마다 minVisible은 남긴다.
 */
export function overlapFor(count: number, available: number): number {
  const L = HAND_LAYOUT
  if (count <= 1) return 0
  const needed = Math.ceil((count * L.cardWidth - available) / (count - 1))
  return Math.min(L.cardWidth - L.minVisible, Math.max(0, needed))
}
