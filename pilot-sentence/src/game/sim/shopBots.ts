import { createRng, nextFloat, nextInt } from '@/kit/core/rng'
import type { RelicId, StructureId } from '@/game/build/build'
import { getWord, type WordId } from '@/game/content/words'
import type { RunState } from '@/game/run/run'
import { type OfferKind, rerollPrice, type ShopItem } from '@/game/run/shop'
import { SHOP_RULES } from '@/game/content/balance'
import { simulateRun, type ShopPolicy } from './runSim'

/** 상점 구매 성향. 점수 = 종류 가중치 × 세부 가중치 ÷ 값. 점수가 saveThreshold보다 큰 것을 높은 순으로 산다. */
export interface ShopWeights {
  readonly kinds: Readonly<Record<OfferKind, number>>
  readonly relics: Readonly<Partial<Record<RelicId, number>>>
  readonly structures: Readonly<Partial<Record<StructureId, number>>>
  /** 특정 단어(사거나 강화할 때)의 선호. 유형 봇이 쓴다. 학습은 이 값을 바꾸지 않는다. */
  readonly wordBias: Readonly<Partial<Record<WordId, number>>>
  readonly connectiveBias: number
  readonly saveThreshold: number
}

const RELIC_IDS: readonly RelicId[] = ['longSentence', 'adjectiveChain', 'stress', 'ellipsis', 'scarecrowSpeaker', 'poisonGrammar', 'resonance', 'echo']
const STRUCTURE_IDS: readonly StructureId[] = ['subjectSlot', 'objectSlot', 'verbSlot', 'handSize', 'discard']
const KINDS: readonly OfferKind[] = ['word', 'upgrade', 'structure', 'relic']

export const BASE_WEIGHTS: ShopWeights = {
  kinds: { word: 1, upgrade: 1, structure: 1, relic: 1 },
  relics: {},
  structures: {},
  wordBias: {},
  connectiveBias: 1,
  saveThreshold: 0.05,
}

function itemScore(run: RunState, item: ShopItem, w: ShopWeights): number {
  const offer = item.offer
  let detail = 1
  switch (offer.kind) {
    case 'word':
      detail = (getWord(offer.wordId).kind === 'connective' ? w.connectiveBias : 1) * (w.wordBias[offer.wordId] ?? 1)
      break
    case 'upgrade':
      // 덱에 많은 단어일수록 강화 가치가 크다.
      detail = run.deck.filter((id) => id === offer.wordId).length * (w.wordBias[offer.wordId] ?? 1)
      break
    case 'structure':
      detail = w.structures[offer.id] ?? 1
      break
    case 'relic':
      detail = w.relics[offer.id] ?? 1
      break
  }
  return (w.kinds[offer.kind] * detail) / Math.max(1, item.price)
}

/** 한 상점에서 봇이 새로고침하는 최대 횟수(무한 루프 방지). */
export const MAX_BOT_REROLLS = 2

/** 살 것이 없을 때 새로고침할까: 새로고침 값 + 가장 싼 단어 값을 낼 수 있고 아직 횟수가 남았으면. */
function shouldReroll(run: RunState): boolean {
  if (!run.shop || run.shop.rerolls >= MAX_BOT_REROLLS) return false
  return run.gold >= rerollPrice(run.shop) + SHOP_RULES.basePrice.word
}

export function weightedShopBot(w: ShopWeights): ShopPolicy {
  return (run, rng) => {
    const items = run.shop?.items ?? []
    let bestIndex = -1
    let bestScore = w.saveThreshold
    for (const [index, item] of items.entries()) {
      if (item.sold || item.price > run.gold) continue
      const score = itemScore(run, item, w)
      if (score > bestScore) [bestIndex, bestScore] = [index, score]
    }
    if (bestIndex >= 0) return [{ type: 'buy', index: bestIndex }, rng]
    return [shouldReroll(run) ? { type: 'reroll' } : { type: 'leave' }, rng]
  }
}

/** 절반 확률로 떠나고, 아니면 살 수 있는 것 중 무작위로 산다. */
export const randomShopBot: ShopPolicy = (run, rng) => {
  const [coin, afterCoin] = nextFloat(rng)
  const affordable = (run.shop?.items ?? []).flatMap((item, index) => (!item.sold && item.price <= run.gold ? [index] : []))
  if (coin < 0.5 || affordable.length === 0) return [{ type: 'leave' }, afterCoin]
  const [pick, next] = nextInt(afterCoin, 0, affordable.length - 1)
  return [{ type: 'buy', index: affordable[pick] }, next]
}

export const noShopBot: ShopPolicy = (_run, rng) => [{ type: 'leave' }, rng]

/** 빌드 유형 5종(런 spec §7.1). */
export const ARCHETYPES: Readonly<Record<'poison' | 'connective' | 'structure' | 'relic' | 'focus', ShopWeights>> = {
  poison: {
    ...BASE_WEIGHTS,
    relics: { poisonGrammar: 10 },
    wordBias: { venomous: 5, poisonFeed: 5 },
  },
  connective: { ...BASE_WEIGHTS, kinds: { word: 3, upgrade: 1, structure: 1, relic: 1 }, connectiveBias: 5, relics: { echo: 0.2 } },
  structure: { ...BASE_WEIGHTS, kinds: { word: 0.5, upgrade: 1, structure: 4, relic: 1 } },
  relic: { ...BASE_WEIGHTS, kinds: { word: 0.5, upgrade: 1, structure: 1, relic: 4 } },
  focus: { ...BASE_WEIGHTS, kinds: { word: 0.3, upgrade: 4, structure: 1, relic: 1 }, wordBias: { bite: 3 } },
}

// ---- 학습: 가중치 벡터의 무작위 탐색 + 언덕 오르기 ----

type WeightKey =
  | { readonly group: 'kinds'; readonly id: OfferKind }
  | { readonly group: 'relics'; readonly id: RelicId }
  | { readonly group: 'structures'; readonly id: StructureId }
  | { readonly group: 'connectiveBias' }
  | { readonly group: 'saveThreshold' }

const WEIGHT_KEYS: readonly WeightKey[] = [
  ...KINDS.map((id) => ({ group: 'kinds' as const, id })),
  ...RELIC_IDS.map((id) => ({ group: 'relics' as const, id })),
  ...STRUCTURE_IDS.map((id) => ({ group: 'structures' as const, id })),
  { group: 'connectiveBias' },
  { group: 'saveThreshold' },
]

function getWeight(w: ShopWeights, key: WeightKey): number {
  switch (key.group) {
    case 'kinds':
      return w.kinds[key.id]
    case 'relics':
      return w.relics[key.id] ?? 1
    case 'structures':
      return w.structures[key.id] ?? 1
    case 'connectiveBias':
      return w.connectiveBias
    case 'saveThreshold':
      return w.saveThreshold
  }
}

function setWeight(w: ShopWeights, key: WeightKey, value: number): ShopWeights {
  switch (key.group) {
    case 'kinds':
      return { ...w, kinds: { ...w.kinds, [key.id]: value } }
    case 'relics':
      return { ...w, relics: { ...w.relics, [key.id]: value } }
    case 'structures':
      return { ...w, structures: { ...w.structures, [key.id]: value } }
    case 'connectiveBias':
      return { ...w, connectiveBias: value }
    case 'saveThreshold':
      return { ...w, saveThreshold: value }
  }
}

/** 적합도: 완주 수가 우선, 같으면 도달 층 합. */
function fitness(w: ShopWeights, seeds: readonly number[]): number {
  const policy = weightedShopBot(w)
  return seeds.reduce((sum, seed) => {
    const r = simulateRun(seed, policy)
    return sum + (r.outcome === 'won' ? 100 : 0) + r.floorReached
  }, 0)
}

const MUTATION_FACTORS = [0.5, 0.7, 1.4, 2] as const
const RANDOM_STARTS = 5

/** 무작위 시작점 5개 중 가장 나은 것에서 출발해, 한 번에 가중치 하나를 바꿔 나아지면 받아들인다. */
export function trainShopWeights(trainSeeds: readonly number[], iterations: number, rngSeed: number): ShopWeights {
  let rng = createRng(rngSeed)
  const randomWeights = (): ShopWeights => {
    let w = BASE_WEIGHTS
    for (const key of WEIGHT_KEYS) {
      const [roll, next] = nextFloat(rng)
      rng = next
      w = setWeight(w, key, getWeight(BASE_WEIGHTS, key) * Math.exp(roll * 2 - 1))
    }
    return w
  }
  let best = BASE_WEIGHTS
  let bestFitness = fitness(best, trainSeeds)
  for (let i = 0; i < RANDOM_STARTS; i++) {
    const candidate = randomWeights()
    const f = fitness(candidate, trainSeeds)
    if (f > bestFitness) [best, bestFitness] = [candidate, f]
  }
  for (let i = 0; i < iterations; i++) {
    const [keyIndex, r1] = nextInt(rng, 0, WEIGHT_KEYS.length - 1)
    const [factorIndex, r2] = nextInt(r1, 0, MUTATION_FACTORS.length - 1)
    rng = r2
    const key = WEIGHT_KEYS[keyIndex]
    const candidate = setWeight(best, key, getWeight(best, key) * MUTATION_FACTORS[factorIndex])
    const f = fitness(candidate, trainSeeds)
    if (f > bestFitness) [best, bestFitness] = [candidate, f]
  }
  return best
}
