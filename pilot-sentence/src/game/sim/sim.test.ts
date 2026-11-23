import { createRng } from '@/kit/core/rng'
import { BALANCE } from '@/game/content/balance'
import { PRESETS } from '@/game/content/rules'
import { greedyBot, passiveBot, randomBot, scoreState } from './bots'
import { combatGame, type SimCombatAction } from './combatGame'
import { startCombat } from '@/game/combat/combat'
import { STARTER_DECK } from '@/game/content/encounters'
import { combatMetrics, combatTurnMetrics } from './metrics'

const gameB = combatGame('spider', PRESETS.B, BALANCE)
const gameC = combatGame('spider', PRESETS.C, BALANCE)

test('합법 행동에는 언제나 턴 종료가 있고, 거부될 행동은 없다', () => {
  const s = gameB.start(123)
  const legal = gameB.legalActions(s)
  expect(legal.some((a) => a.action.type === 'endTurn')).toBe(true)
  expect(legal.some((a) => a.action.type === 'swap')).toBe(true)
  expect(gameB.legalActions({ ...s, resource: 0, swapsLeft: 0 })).toEqual([expect.objectContaining({ key: 'endTurn' })])
})

test('낭독 프리셋에서는 낭독과 추가 드로우가 합법 행동에 포함된다', () => {
  const keys = gameC.legalActions(gameC.start(1)).map((a) => a.key)
  expect(keys).toContain('cast')
  expect(keys).toContain('drawPaid')
})

test('무행동 봇은 턴 종료, 무작위 봇은 합법 행동 중 하나', () => {
  const s = gameB.start(5)
  expect(passiveBot(gameB, s, createRng(1))[0].key).toBe('endTurn')
  expect(gameB.legalActions(s).map((x) => x.key)).toContain(randomBot(gameB, s, createRng(5))[0].key)
})

function playOneTurn(seed: number, bot: typeof greedyBot) {
  let s = gameB.start(seed)
  let rng = createRng(seed)
  for (let i = 0; i < 20; i++) {
    const [a, next]: [SimCombatAction, typeof rng] = bot(gameB, s, rng)
    rng = next
    s = gameB.apply(s, a)
    if (a.action.type === 'endTurn' || a.action.type === 'cast') break
  }
  return s
}

test('탐욕 봇은 첫 턴에 아무것도 안 할 때보다 나쁘지 않고, 시드 합계로는 낫다', () => {
  let greedyTotal = 0
  let passiveTotal = 0
  for (const seed of [1, 2, 3, 4, 5]) {
    const greedy = scoreState(playOneTurn(seed, greedyBot))
    const passive = scoreState(playOneTurn(seed, passiveBot))
    expect(greedy).toBeGreaterThanOrEqual(passive)
    greedyTotal += greedy
    passiveTotal += passive
  }
  expect(greedyTotal).toBeGreaterThan(passiveTotal)
})

test('점수는 이월되는 보호를 반영한다', () => {
  const s = gameB.start(1)
  const withBlock = (id: string, block: number) => ({
    ...s,
    entities: s.entities.map((e) => (e.id === id ? { ...e, statuses: { ...e.statuses, block } } : e)),
  })
  expect(scoreState(withBlock('e0', 6))).toBeLessThan(scoreState(s))
  expect(scoreState(withBlock('p', 6))).toBeGreaterThan(scoreState(s))
})

test('턴 지표: 쓸 수 없는 손패 비율, 선택지 다양성, 뻔한 최선 여부', () => {
  const s = gameB.start(1)
  const m = combatTurnMetrics(gameB)(s)
  expect(m.unplayableRate).toBeGreaterThanOrEqual(0)
  expect(m.unplayableRate).toBeLessThanOrEqual(1)
  expect(m.choiceDiversity).toBeGreaterThanOrEqual(1)
  expect([0, 1]).toContain(m.obviousBest)
  // 손패가 오염 카드뿐이면 쓸 수 없는 비율은 1
  const junk = { ...s, deck: { ...s.deck, hand: [{ instanceId: 'w', wordId: 'web' }] } }
  expect(combatTurnMetrics(gameB)(junk).unplayableRate).toBe(1)
})

describe('combatMetrics: 흉조 축 비교 지표', () => {
  test('낭비율 = 실행 전 지워진 단어 / 놓은 단어, 최대 한 방은 기록 그대로', () => {
    const base = startCombat('spider', STARTER_DECK, 1, BALANCE, PRESETS.A).state
    const m = combatMetrics({ ...base, log: { placed: 4, wasted: 1, bestBurst: 12, unexecuted: [] } })
    expect(m).toMatchObject({ wastedRate: 0.25, bestBurst: 12 })
  })

  test('놓은 단어가 없으면 낭비율 0', () => {
    const base = startCombat('spider', STARTER_DECK, 1, BALANCE, PRESETS.A).state
    expect(combatMetrics(base).wastedRate).toBe(0)
  })
})
