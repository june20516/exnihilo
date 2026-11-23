import { createRng } from '@/kit/core/rng'
import { BALANCE } from '@/game/content/balance'
import { greedyBot, passiveBot, randomBot, scoreState } from './bots'
import { combatGame, type SimCombatAction } from './combatGame'

const game = combatGame('spider', BALANCE)

test('합법 행동에는 언제나 턴 종료가 있고, 거부될 행동은 없다', () => {
  const s = game.start(123)
  const legal = game.legalActions(s)
  expect(legal.some((a) => a.action.type === 'endTurn')).toBe(true)
  expect(game.legalActions({ ...s, ap: 0 })).toEqual([expect.objectContaining({ key: 'endTurn' })])
  expect(legal.length).toBeGreaterThan(1)
})

test('무행동 봇은 언제나 턴 종료', () => {
  const [a] = passiveBot(game, game.start(1), createRng(1))
  expect(a.key).toBe('endTurn')
})

test('무작위 봇은 합법 행동 중 하나를 고른다', () => {
  const s = game.start(5)
  const [a] = randomBot(game, s, createRng(5))
  expect(game.legalActions(s).map((x) => x.key)).toContain(a.key)
})

function playOneTurn(seed: number, bot: typeof greedyBot) {
  let s = game.start(seed)
  let rng = createRng(seed)
  for (let i = 0; i < 20; i++) {
    const [a, next]: [SimCombatAction, typeof rng] = bot(game, s, rng)
    rng = next
    s = game.apply(s, a)
    if (a.action.type === 'endTurn') break
  }
  return s
}

test('탐욕 봇은 첫 턴에 아무것도 안 할 때보다 나쁘지 않고, 시드 합계로는 낫다', () => {
  // 손패에 유효한 수가 없는 시드(예: 2)도 있으므로 시드별로는 '같거나 낫다'만 요구한다.
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

test('수식어 단어는 칸을 명시한 후보만 나온다(중복 없음)', () => {
  const keys = game.legalActions(game.start(1)).map((a) => a.key)
  expect(keys).not.toContain('place:blind@0:subject')
  expect(new Set(keys).size).toBe(keys.length)
})

test('점수는 이월되는 보호를 반영한다: 적 보호는 감점, 내 보호는 가점', () => {
  const s = game.start(1)
  const withBlock = (id: string, block: number) => ({
    ...s,
    entities: s.entities.map((e) => (e.id === id ? { ...e, statuses: { ...e.statuses, block } } : e)),
  })
  expect(scoreState(withBlock('e0', 6))).toBeLessThan(scoreState(s))
  expect(scoreState(withBlock('p', 6))).toBeGreaterThan(scoreState(s))
})
