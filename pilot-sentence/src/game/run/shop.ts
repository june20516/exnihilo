import { nextFloat, nextInt, type RngState, shuffle } from '@/kit/core/rng'
import { type BuildState, isUpgradable, MAX_SLOTS, type RelicId, type StructureId } from '@/game/build/build'
import { RELICS } from '@/game/build/relics'
import { getWord, type Rarity, WORDS, type WordId } from '@/game/content/words'
import type { SlotRole, WordKind } from '@/game/grammar/frames'

export type Offer =
  | { readonly kind: 'word'; readonly wordId: WordId }
  | { readonly kind: 'upgrade'; readonly wordId: WordId }
  | { readonly kind: 'structure'; readonly id: StructureId }
  | { readonly kind: 'relic'; readonly id: RelicId }

export type OfferKind = Offer['kind']

export interface ShopItem {
  readonly offer: Offer
  readonly price: number
  readonly sold: boolean
}

export interface ShopState {
  readonly items: readonly ShopItem[]
}

/** 런 spec §3: 종류별 기본값, 희귀도 보정, 구매 후 가격 상승. */
export const BASE_PRICE: Readonly<Record<OfferKind, number>> = { word: 6, upgrade: 8, structure: 12, relic: 15 }
const RARITY_ADJUST: Readonly<Record<Rarity, number>> = { starter: -3, common: -3, uncommon: 0, rare: 3 }
const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = { starter: 60, common: 60, uncommon: 30, rare: 10 }
/** 조합 재료(형용사·부사·연결어)는 단어 보상으로 뽑힐 가중치가 이만큼 크다. 빌드 레이어를 런마다 겪게 하려는 보정. */
export const MATERIAL_WEIGHT = 3
const MATERIAL_KINDS: readonly WordKind[] = ['adjective', 'adverb', 'connective']
export const PRICE_GROWTH = 1.5
const SHOP_SIZE = 3

export const STRUCTURES: readonly StructureId[] = ['subjectSlot', 'objectSlot', 'verbSlot', 'handSize', 'discard']
const SLOT_ROLE: Partial<Record<StructureId, SlotRole>> = { subjectSlot: 'subject', objectSlot: 'object', verbSlot: 'verb' }

/** 상점에 내지 않는 단어: 천천히(부사, v2에서 손해만 줌. 형용사 상태 spec §6). */
const SHOP_EXCLUDED: readonly WordId[] = ['slowly']

/** 상점에 나올 수 있는 단어: 플레이어용, 오염 아님, 제외 목록 밖. */
export const WORD_POOL: readonly WordId[] = Object.values(WORDS)
  .filter((w) => !w.enemyOnly && w.kind !== 'junk' && !SHOP_EXCLUDED.includes(w.id))
  .map((w) => w.id)

function rarityOf(offer: Offer): Rarity | null {
  switch (offer.kind) {
    case 'word':
    case 'upgrade':
      return getWord(offer.wordId).rarity
    case 'relic':
      return RELICS[offer.id].rarity
    case 'structure':
      return null
  }
}

export function priceOf(offer: Offer): number {
  const rarity = rarityOf(offer)
  return BASE_PRICE[offer.kind] + (rarity ? RARITY_ADJUST[rarity] : 0)
}


function upgradeCandidates(deck: readonly WordId[], build: BuildState): WordId[] {
  return [...new Set(deck)].filter((id) => isUpgradable(id) && (build.upgrades[id] ?? 0) < 2)
}

function structureCandidates(build: BuildState): StructureId[] {
  return STRUCTURES.filter((id) => {
    const role = SLOT_ROLE[id]
    return role === undefined || build.slots[role] < MAX_SLOTS
  })
}

function relicCandidates(build: BuildState): RelicId[] {
  return (Object.keys(RELICS) as RelicId[]).filter((id) => !build.relics.includes(id))
}

function pickUniform<T>(rng: RngState, items: readonly T[]): [T, RngState] {
  const [index, next] = nextInt(rng, 0, items.length - 1)
  return [items[index], next]
}

function wordWeight(id: WordId): number {
  const word = getWord(id)
  return RARITY_WEIGHT[word.rarity] * (MATERIAL_KINDS.includes(word.kind) ? MATERIAL_WEIGHT : 1)
}

function pickWord(rng: RngState): [WordId, RngState] {
  const total = WORD_POOL.reduce((sum, id) => sum + wordWeight(id), 0)
  const [roll, next] = nextFloat(rng)
  let remaining = roll * total
  for (const id of WORD_POOL) {
    remaining -= wordWeight(id)
    if (remaining < 0) return [id, next]
  }
  return [WORD_POOL[WORD_POOL.length - 1], next]
}

/** 종류가 서로 다른 보상 3개(살 수 있는 종류가 모자라면 그만큼 적게). */
export function rollShop(rng: RngState, deck: readonly WordId[], build: BuildState): [ShopState, RngState] {
  const upgrades = upgradeCandidates(deck, build)
  const structures = structureCandidates(build)
  const relics = relicCandidates(build)
  const available: OfferKind[] = ['word']
  if (upgrades.length > 0) available.push('upgrade')
  if (structures.length > 0) available.push('structure')
  if (relics.length > 0) available.push('relic')
  const [kinds, shuffled] = shuffle(rng, available)
  let current = shuffled
  const items: ShopItem[] = []
  for (const kind of kinds.slice(0, SHOP_SIZE)) {
    let offer: Offer
    if (kind === 'word') {
      const [wordId, next] = pickWord(current)
      offer = { kind, wordId }
      current = next
    } else if (kind === 'upgrade') {
      const [wordId, next] = pickUniform(current, upgrades)
      offer = { kind, wordId }
      current = next
    } else if (kind === 'structure') {
      const [id, next] = pickUniform(current, structures)
      offer = { kind, id }
      current = next
    } else {
      const [id, next] = pickUniform(current, relics)
      offer = { kind, id }
      current = next
    }
    items.push({ offer, price: priceOf(offer), sold: false })
  }
  return [{ items }, current]
}

/** 산 것을 표시하고, 남은 보상의 값을 ×1.5(올림) 올린다. */
export function buyFrom(shop: ShopState, index: number): ShopState {
  return {
    items: shop.items.map((item, i) =>
      i === index ? { ...item, sold: true } : item.sold ? item : { ...item, price: Math.ceil(item.price * PRICE_GROWTH) },
    ),
  }
}
