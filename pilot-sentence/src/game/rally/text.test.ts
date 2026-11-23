import { BALANCE } from '@/game/content/balance'
import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import type { WordId } from '@/game/content/words'
import { type CardInst, type RallyAction, type RallyState, reduceRally, startRally } from './combat'
import { previewEvents } from './preview'
import { intentTexts, lingeringTexts, REJECT_MESSAGES, sentenceText, wordNamer } from './text'
import { intentClause } from './testFixtures'

RALLY_ENCOUNTERS['test-text-seal'] = {
  id: 'test-text-seal',
  name: '시험 필경사',
  tier: 'boss',
  enemies: [{ defId: 'spider', name: '필경사', hp: 60, row: 'front', portrait: '', intents: [{ kind: 'seal' }, intentClause('spider', 'testBite')] }],
}

const DECK: WordId[] = ['bite', 'bite', 'guard', 'fiercely', 'hungry', 'cracked']
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a, BALANCE).state
const withHand = (s: RallyState, words: WordId[]): RallyState => ({
  ...s,
  deck: { drawPile: [], discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
})
const intents = (s: RallyState) => intentTexts(s, previewEvents(s, BALANCE).enemy, wordNamer(s))

test('적 예고: 문장과 그 적이 낼 수치', () => {
  const s = startRally('test-dummy', DECK, 1, BALANCE).state
  expect(intents(s)).toEqual({ e0: '거미가 당신을 물어뜯는다 — 피해 7' })
})

test('적 예고: 봉인은 다음에 봉인될 내 칸을 말한다', () => {
  const s = startRally('test-text-seal', DECK, 1, BALANCE).state
  expect(intents(s)).toEqual({ e0: '필경사가 당신의 주어 칸을 봉인한다' })
})

test('내 문장: 빈칸은 낭독하면 채워질 대상 이름으로, 동사가 없으면 빈 동사로 보인다', () => {
  const s = withHand(startRally('test-dummy', DECK, 1, BALANCE).state, ['bite', 'fiercely'])
  expect(sentenceText(s)).toEqual(['당신이 거미를 ___'])
  const placed = act(act(s, { type: 'place', instanceId: 'h0', at: { clause: 0, role: 'verb' } }), {
    type: 'place', instanceId: 'h1', at: { clause: 0, role: 'verb' },
  })
  expect(sentenceText(placed)).toEqual(['당신이 거미를 격렬하게 물어뜯는다'])
})

test('거부 메시지: 모든 거부 사유에 문구가 있다', () => {
  for (const message of Object.values(REJECT_MESSAGES)) expect(message.length).toBeGreaterThan(0)
  expect(REJECT_MESSAGES.slotSealed).toContain('봉인')
  expect(REJECT_MESSAGES.notEnoughGold).toContain('화폐')
})

test('적 예고: 맞힐 때 거는 독도 수치에 나온다', () => {
  const turn2 = act(startRally('spider', DECK, 1, BALANCE).state, { type: 'endTurn' })
  const text = intents(turn2).e0 ?? ''
  expect(text).toContain('독을 뿜는')
  expect(text).toMatch(/피해 \d+, 독 \+\d+/)
})

test('적 예고: 같은 턴에 둘이 봉인하면 순서대로 다음 칸을 말한다', () => {
  const s = startRally('test-seal-two', DECK, 1, BALANCE).state
  expect(intents(s)).toEqual({ e0: '필경사 1이 당신의 주어 칸을 봉인한다', e1: '필경사 2가 당신의 목적어 칸을 봉인한다' })
})

test('적 예고: 얼어 있는 적은 빙결로 무효라고 말하고, 봉인 순서에서도 빠진다', () => {
  const s = startRally('test-seal-two', DECK, 1, BALANCE).state
  const frozen: RallyState = { ...s, entities: s.entities.map((e) => (e.id === 'e0' ? { ...e, statuses: { ...e.statuses, freeze: 1 } } : e)) }
  expect(intents(frozen)).toEqual({
    e0: '필경사 1이 당신의 주어 칸을 봉인한다 — 빙결로 무효',
    e1: '필경사 2가 당신의 주어 칸을 봉인한다',
  })
})

test('남을 상태: 지금 문장대로 낭독하면 남을 형용사 상태를 개체별로 보인다', () => {
  const base = withHand(startRally('test-dummy', DECK, 1, BALANCE).state, ['bite', 'blind', 'blind'])
  const verb = act(base, { type: 'place', instanceId: 'h0', at: { clause: 0, role: 'verb' } })
  const one = act(verb, { type: 'place', instanceId: 'h1', at: { clause: 0, role: 'object' } })
  expect(lingeringTexts(one)).toEqual({ e0: ['눈멂 · 적 차례까지'] })
  const two = act(one, { type: 'place', instanceId: 'h2', at: { clause: 0, role: 'object' } })
  expect(lingeringTexts(two)).toEqual({ e0: ['눈멂 ×2 · 적 차례까지'] })
  const noVerb = act(base, { type: 'place', instanceId: 'h1', at: { clause: 0, role: 'object' } })
  expect(lingeringTexts(noVerb)).toEqual({})
})
