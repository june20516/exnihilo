/**
 * 슬로모션 채도 필터를 어디에 걸지(B2 spec 7절: 개입 중 고른 대상은 스튜디오에서 밝게 남긴다).
 * Pixi 필터는 자식 하나만 빼고 걸 수 없으므로, 초점 대상이 없으면 world 하나에 걸고(가장 싸다)
 * 있으면 world 대신 초점 대상(몸·머리 위 표시) 밖의 레이어마다 건다.
 */
export interface SaturationPlan<T> {
  /** world 전체에 거는가 */
  world: boolean
  /** 필터를 거는 레이어 */
  filtered: readonly T[]
  /** 필터를 빼는 레이어(초점 대상, 또는 world에 걸었거나 필터가 없을 때 모든 레이어) */
  unfiltered: readonly T[]
}

/**
 * active: 지금 채도 필터가 있는 모드인가(개입·자동 슬로모션). layers: world 안의 레이어(바닥, 몸, 머리 위 표시 등).
 * kept: 필터 밖에 둘 초점 대상 레이어. layers에 없는 것은 무시한다.
 */
export function saturationPlan<T>(active: boolean, layers: readonly T[], kept: readonly T[]): SaturationPlan<T> {
  const keptInLayers = layers.filter((layer) => kept.includes(layer))
  if (!active || keptInLayers.length === 0) {
    return { world: active, filtered: [], unfiltered: layers }
  }
  return {
    world: false,
    filtered: layers.filter((layer) => !keptInLayers.includes(layer)),
    unfiltered: keptInLayers,
  }
}
