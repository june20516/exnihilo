import type { WordId } from '@/game/content/words'
import { type CardInst, type RallyState, reduceRally, startRally } from '@/game/rally/combat'
import '@/game/rally/testFixtures'
import type { RunState } from '@/game/run/run'
import { startRun } from '@/game/run/run'
import { twoPlyBot } from './combatBot'
import { simulateRun } from './runSim'
import { noShopBot, type ShopWeights, trainShopWeights, weightedShopBot } from './shopBots'

const withHand = (words: WordId[]): RallyState => ({
  ...startRally('test-dummy', ['bite'], 1).state,
  deck: { drawPile: [], discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
})

test('두 수 앞 봇은 손패에 동사 둘과 연결어가 있으면 두 절로 낭독한다', () => {
  let s = withHand(['bite', 'and', 'bite'])
  for (let i = 0; i < 10; i++) {
    const action = twoPlyBot(s)
    if (action.type === 'cast') {
      expect(s.board.clauses).toHaveLength(2)
      return
    }
    expect(action.type).not.toBe('endTurn')
    s = reduceRally(s, action).state
  }
  throw new Error('낭독하지 않았다')
})

test('두 수 앞 봇은 버리기를 고르지 않는다(덱을 엿보지 않도록)', () => {
  let s = withHand(['fiercely', 'hungry', 'cracked'])
  s = { ...s, deck: { ...s.deck, drawPile: [{ instanceId: 'd0', wordId: 'bite' }] } }
  expect(twoPlyBot(s).type).not.toBe('discard')
})

test('simulateRun은 끝까지 진행해 won 또는 lost를 낸다(안 삼 봇, 시드 2개)', () => {
  for (const seed of [1, 2]) {
    const result = simulateRun(seed, noShopBot)
    expect(['won', 'lost']).toContain(result.outcome)
    expect(result.floorReached).toBeGreaterThanOrEqual(1)
    expect(result.purchases).toEqual([])
  }
})

test('weightedShopBot은 점수 높은 순으로 사고, 기준 이하이거나 돈이 모자라면 떠난다', () => {
  const base = startRun(1).state
  const shopRun: RunState = {
    ...base,
    phase: 'shop',
    gold: 15,
    shop: {
      items: [
        { offer: { kind: 'word', wordId: 'and' }, price: 3, sold: false },
        { offer: { kind: 'relic', id: 'echo' }, price: 18, sold: false },
        { offer: { kind: 'structure', id: 'verbSlot' }, price: 12, sold: false },
      ],
      rerolls: 0,
    },
  }
  const weights: ShopWeights = {
    kinds: { word: 1, upgrade: 1, structure: 5, relic: 10 },
    relics: {}, structures: {}, wordBias: {}, connectiveBias: 1, saveThreshold: 0.1,
  }
  const [first] = weightedShopBot(weights)(shopRun, base.rng)
  expect(first).toEqual({ type: 'buy', index: 2 })
  const [poor] = weightedShopBot(weights)({ ...shopRun, gold: 2 }, base.rng)
  expect(poor).toEqual({ type: 'leave' })
})

test('trainShopWeights는 결정적이다', () => {
  const a = trainShopWeights([1, 2], 2, 7)
  const b = trainShopWeights([1, 2], 2, 7)
  expect(a).toEqual(b)
})

test('시간 초과로 끝난 전투도 층별 턴에 기록되고 timedOut으로 표시된다(집계에서 빠지지 않게)', () => {
  const r = simulateRun(1001, noShopBot, 1)
  expect(r.timedOut).toBe(true)
  expect(r.outcome).toBe('lost')
  const last = r.floorTurns[r.floorTurns.length - 1]
  expect(last?.floor).toBe(r.floorReached)
  expect(last?.turns).toBeGreaterThan(1)
})

test('weightedShopBot은 살 만한 것이 없고 화폐가 넉넉하면 새로고침하되, 같은 상점에서 2번까지만 한다', () => {
  const base = startRun(1).state
  const shop = { items: [{ offer: { kind: 'word' as const, wordId: 'slowly' }, price: 3, sold: false }], rerolls: 0 }
  const shopRun: RunState = { ...base, phase: 'shop', gold: 30, shop }
  const weights: ShopWeights = {
    kinds: { word: 0, upgrade: 0, structure: 0, relic: 0 },
    relics: {}, structures: {}, wordBias: {}, connectiveBias: 1, saveThreshold: 0.1,
  }
  const bot = weightedShopBot(weights)
  expect(bot(shopRun, base.rng)[0]).toEqual({ type: 'reroll' })
  expect(bot({ ...shopRun, shop: { ...shop, rerolls: 2 } }, base.rng)[0]).toEqual({ type: 'leave' })
  expect(bot({ ...shopRun, gold: 4 }, base.rng)[0]).toEqual({ type: 'leave' })
})

test('학습 봇 런의 새로고침 횟수는 상점 수 × 2를 넘지 않는다', () => {
  const weights: ShopWeights = {
    kinds: { word: 0, upgrade: 0, structure: 0, relic: 0 },
    relics: {}, structures: {}, wordBias: {}, connectiveBias: 1, saveThreshold: 0.1,
  }
  for (const seed of [11, 12]) {
    const r = simulateRun(seed, weightedShopBot(weights))
    expect(r.rerolls).toBeLessThanOrEqual(2 * Math.max(0, r.floorReached - 1))
  }
})
