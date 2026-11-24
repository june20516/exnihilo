import { createRng } from '@/kit/core/rng'
import type { WordId } from '@/game/content/words'
import type { CardInst, RallyState } from '@/game/rally/combat'
import { greedyBot, passiveBot, randomBot, scoreState } from './bots'
import { combatGame, type SimCombatAction } from './combatGame'
import { combatMetrics, combatTurnMetrics } from './metrics'

const game = combatGame('spider')
const withHand = (s: RallyState, words: WordId[]): RallyState => ({
  ...s,
  deck: { ...s.deck, hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
})

test('합법 행동에는 언제나 턴 종료가 있고, 거부될 행동은 없다', () => {
  for (const seed of [1, 2, 3]) {
    const s = game.start(seed)
    const legal = game.legalActions(s)
    expect(legal.some((a) => a.action.type === 'endTurn')).toBe(true)
    for (const a of legal) {
      const next = game.apply(s, a)
      if (a.action.type !== 'endTurn' && a.action.type !== 'cast') expect(next).not.toBe(s)
    }
  }
})

test('동사가 없으면 낭독이 없고, 동사를 놓으면 낭독이 생긴다', () => {
  const s = withHand(game.start(1), ['bite'])
  expect(game.legalActions(s).map((a) => a.key)).not.toContain('cast')
  const placed = game.apply(s, game.legalActions(s).find((a) => a.key === 'place:bite@0:verb') as SimCombatAction)
  expect(game.legalActions(placed).map((a) => a.key)).toContain('cast')
})

test('버리기를 쓴 뒤에는 버리기 행동이 없다', () => {
  const s = withHand(game.start(1), ['bite', 'guard'])
  const discard = game.legalActions(s).find((a) => a.action.type === 'discard') as SimCombatAction
  expect(discard).toBeDefined()
  expect(game.legalActions(game.apply(s, discard)).some((a) => a.action.type === 'discard')).toBe(false)
})

test('무행동 봇은 턴 종료, 무작위 봇은 합법 행동 중 하나', () => {
  const s = game.start(5)
  expect(passiveBot(game, s, createRng(1))[0].key).toBe('endTurn')
  expect(game.legalActions(s).map((x) => x.key)).toContain(randomBot(game, s, createRng(5))[0].key)
})

test('탐욕 봇은 첫 턴에 아무것도 안 할 때보다 낫다(시드 합계)', () => {
  const playOneTurn = (seed: number, bot: typeof greedyBot) => {
    let s = game.start(seed)
    let rng = createRng(seed)
    for (let i = 0; i < 20; i++) {
      const [a, next] = bot(game, s, rng)
      rng = next
      s = game.apply(s, a)
      if (a.action.type === 'endTurn' || a.action.type === 'cast') break
    }
    return s
  }
  const total = (bot: typeof greedyBot) => [1, 2, 3, 4, 5].reduce((sum, seed) => sum + scoreState(playOneTurn(seed, bot)), 0)
  expect(total(greedyBot)).toBeGreaterThan(total(passiveBot))
})

test('combatMetrics: 비율과 0으로 나누기', () => {
  const s = game.start(1)
  expect(combatMetrics(s)).toMatchObject({ hpLost: 0, turns: 1, defendRate: 0, bestBurst: 0 })
  const m = combatMetrics({ ...s, turn: 4, log: { casts: 4, defensiveCasts: 1, deadTurns: 1, bestBurst: 12 } })
  expect(m).toMatchObject({ deadTurnRate: 0.25, defendRate: 0.25, bestBurst: 12 })
})

test('턴 지표: 선택지 다양성과 뻔한 최선 여부', () => {
  const m = combatTurnMetrics(game)(game.start(1))
  expect(m.choiceDiversity).toBeGreaterThanOrEqual(1)
  expect([0, 1]).toContain(m.obviousBest)
})
