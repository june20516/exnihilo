import { RALLY_RULES, SHOP_RULES } from '@/game/content/balance'
import { nextFloat, nextInt, type RngState, shuffle } from '@/kit/core/rng'
import { type BuildState, canUpgradeFurther, isUpgradable, type RelicId, type StructureId } from '@/game/build/build'
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
  /** 이 상점에서 새로고침한 횟수. 값이 오른다. */
  readonly rerolls: number
}

/** 조합 재료: 단어 보상 가중치에 SHOP_RULES.materialWeight를 곱하는 품사. */
const MATERIAL_KINDS: readonly WordKind[] = ['adjective', 'adverb', 'connective']

export const STRUCTURES: readonly StructureId[] = ['subjectSlot', 'objectSlot', 'verbSlot', 'handSize', 'discard']
const SLOT_ROLE: Partial<Record<StructureId, SlotRole>> = { subjectSlot: 'subject', objectSlot: 'object', verbSlot: 'verb' }

/** 상점에 나올 수 있는 단어: 플레이어용, 오염 아님, inShop. */
export const WORD_POOL: readonly WordId[] = Object.values(WORDS)
  .filter((w) => !w.enemyOnly && w.kind !== 'junk' && w.inShop)
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
  return SHOP_RULES.basePrice[offer.kind] + (rarity ? SHOP_RULES.rarityAdjust[rarity] : 0)
}


function upgradeCandidates(deck: readonly WordId[], build: BuildState): WordId[] {
  return [...new Set(deck)].filter((id) => isUpgradable(id) && canUpgradeFurther(build, id))
}

function structureCandidates(build: BuildState): StructureId[] {
  return STRUCTURES.filter((id) => {
    const role = SLOT_ROLE[id]
    return role === undefined || build.slots[role] < RALLY_RULES.maxSlots
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
  return SHOP_RULES.rarityWeight[word.rarity] * (MATERIAL_KINDS.includes(word.kind) ? SHOP_RULES.materialWeight : 1)
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
  for (const kind of kinds.slice(0, SHOP_RULES.size)) {
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
  return [{ items, rerolls: 0 }, current]
}

/** 산 것을 표시하고, 남은 보상의 값을 ×1.5(올림) 올린다. */
export function buyFrom(shop: ShopState, index: number): ShopState {
  return {
    ...shop,
    items: shop.items.map((item, i) =>
      i === index ? { ...item, sold: true } : item.sold ? item : { ...item, price: Math.ceil(item.price * SHOP_RULES.priceGrowth) },
    ),
  }
}

/** 이 상점에서 다음 새로고침의 값. */
export function rerollPrice(shop: ShopState): number {
  return SHOP_RULES.reroll.base + SHOP_RULES.reroll.step * shop.rerolls
}

/** 팔리지 않은 자리를 새로 뽑은 상품으로 앞에서부터 채운다. 팔린 자리는 그대로 둔다. */
export function rerollShop(rng: RngState, shop: ShopState, deck: readonly WordId[], build: BuildState): [ShopState, RngState] {
  const [fresh, next] = rollShop(rng, deck, build)
  let cursor = 0
  const items = shop.items.map((item) => {
    if (item.sold) return item
    const replacement = fresh.items[cursor++]
    return replacement ?? item
  })
  return [{ items, rerolls: shop.rerolls + 1 }, next]
}
