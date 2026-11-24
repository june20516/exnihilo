import { CHARACTERS, DEFAULT_CHARACTER } from '@/game/content/characters'
import { createRng } from '@/kit/core/rng'
import { applyStructure, type BuildState, EMPTY_BUILD, type RelicId } from '@/game/build/build'
import { getWord } from '@/game/content/words'
import { buyFrom, priceOf, rerollPrice, rerollShop, rollShop, type ShopState, WORD_POOL } from './shop'

const roll = (seed: number, build = EMPTY_BUILD, deck = CHARACTERS[DEFAULT_CHARACTER].starterDeck) => rollShop(createRng(seed), deck, build)[0]

test('진열 3개는 종류가 서로 다르다(시드 50개)', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const kinds = roll(seed).items.map((i) => i.offer.kind)
    expect(kinds).toHaveLength(3)
    expect(new Set(kinds).size).toBe(3)
  }
})

test('단어 보상은 조합 재료(형용사·부사·연결어)가 뽑힐 가중치가 3배다: 단어 보상 중 55~72%', () => {
  let materials = 0
  let words = 0
  for (let seed = 1; seed <= 800; seed++) {
    const word = roll(seed).items.find((i) => i.offer.kind === 'word')?.offer
    if (word?.kind !== 'word') continue
    words++
    if (['adjective', 'adverb', 'connective'].includes(getWord(word.wordId).kind)) materials++
  }
  expect(materials / words).toBeGreaterThan(0.55)
  expect(materials / words).toBeLessThan(0.72)
})

test('구매마다 남은 값 ×1.5 올림: 8 → 12 → 18', () => {
  const shop: ShopState = {
    items: [
      { offer: { kind: 'structure', id: 'verbSlot' }, price: 12, sold: false },
      { offer: { kind: 'upgrade', wordId: 'bite' }, price: 8, sold: false },
      { offer: { kind: 'structure', id: 'handSize' }, price: 12, sold: false },
    ],
    rerolls: 0,
  }
  const once = buyFrom(shop, 0)
  expect(once.items.map((i) => [i.price, i.sold])).toEqual([[12, true], [12, false], [18, false]])
  const twice = buyFrom(once, 2)
  expect(twice.items[1].price).toBe(18)
})

test('강화할 단어가 없으면 강화는 나오지 않는다', () => {
  const upgrades = Object.fromEntries(CHARACTERS[DEFAULT_CHARACTER].starterDeck.map((id) => [id, 2 as const]))
  for (let seed = 1; seed <= 30; seed++) {
    expect(roll(seed, { ...EMPTY_BUILD, upgrades }).items.some((i) => i.offer.kind === 'upgrade')).toBe(false)
  }
})

test('강화 보상은 내 덱의 동사·수식어 중 2단계 미만', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const item of roll(seed, { ...EMPTY_BUILD, upgrades: { bite: 2 } }).items) {
      if (item.offer.kind === 'upgrade') {
        expect(CHARACTERS[DEFAULT_CHARACTER].starterDeck).toContain(item.offer.wordId)
        expect(item.offer.wordId).not.toBe('bite')
      }
    }
  }
})

test('보유 유물은 나오지 않는다, 칸 4인 슬롯 구조는 나오지 않는다', () => {
  const owned: RelicId[] = ['longSentence', 'adjectiveChain', 'stress', 'ellipsis', 'scarecrowSpeaker', 'poisonGrammar', 'resonance']
  let build: BuildState = { ...EMPTY_BUILD, relics: owned }
  for (let i = 0; i < 3; i++) build = applyStructure(build, 'verbSlot')
  for (let seed = 1; seed <= 40; seed++) {
    for (const item of roll(seed, build).items) {
      if (item.offer.kind === 'relic') expect(item.offer.id).toBe('echo')
      if (item.offer.kind === 'structure') expect(item.offer.id).not.toBe('verbSlot')
    }
  }
})

test('가격: 기본값 + 희귀도 보정(보통 −3, 비범 0, 희귀 +3), 구조는 보정 없음', () => {
  expect(priceOf({ kind: 'word', wordId: 'and' })).toBe(3)
  expect(priceOf({ kind: 'word', wordId: 'so' })).toBe(6)
  expect(priceOf({ kind: 'word', wordId: 'while' })).toBe(9)
  expect(priceOf({ kind: 'upgrade', wordId: 'bite' })).toBe(5)
  expect(priceOf({ kind: 'structure', id: 'discard' })).toBe(12)
  expect(priceOf({ kind: 'relic', id: 'longSentence' })).toBe(12)
  expect(priceOf({ kind: 'relic', id: 'stress' })).toBe(18)
})

test('상점 단어 풀: 천천히는 빠지고, 눈먼·단단한은 있다', () => {
  expect(WORD_POOL).not.toContain('slowly')
  expect(WORD_POOL).not.toContain('strike')
  expect(WORD_POOL).toContain('blind')
  expect(WORD_POOL).toContain('sturdy')
})

describe('새로고침', () => {
  test('새로고침은 팔리지 않은 상품만 바꾸고 팔린 상품은 남긴다', () => {
    const shop = buyFrom(roll(5), 0)
    const [next] = rerollShop(createRng(99), shop, CHARACTERS[DEFAULT_CHARACTER].starterDeck, EMPTY_BUILD)
    expect(next.items[0]).toEqual(shop.items[0])
    expect(next.items).toHaveLength(shop.items.length)
    expect(next.items.slice(1).every((item) => !item.sold)).toBe(true)
    expect(next.rerolls).toBe(1)
  })

  test('새로고침 값은 3, 4, 5로 오른다', () => {
    let shop = roll(6)
    const prices: number[] = []
    for (let i = 0; i < 3; i++) {
      prices.push(rerollPrice(shop))
      shop = rerollShop(createRng(i), shop, CHARACTERS[DEFAULT_CHARACTER].starterDeck, EMPTY_BUILD)[0]
    }
    expect(prices).toEqual([3, 4, 5])
  })
})
