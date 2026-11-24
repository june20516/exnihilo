import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import type { WordId } from '@/game/content/words'
import { type CardInst, type RallyAction, type RallyState, reduceRally, startRally } from './combat'
import { previewEvents } from './preview'
import { eventNotice, intentTexts, lingeringTexts, omitsObject, REJECT_MESSAGES, sentenceText, wordNamer } from './text'
import { intentClause } from './testFixtures'

RALLY_ENCOUNTERS['test-text-seal'] = {
  id: 'test-text-seal',
  name: '시험 필경사',
  tier: 'boss',
  enemies: [{ defId: 'spider', name: '필경사', hp: 60, row: 'front', portrait: '', intents: [{ kind: 'seal' }, intentClause('spider', 'testBite')] }],
}

const DECK: WordId[] = ['bite', 'bite', 'guard', 'fiercely', 'hungry', 'cracked']
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a).state
const withHand = (s: RallyState, words: WordId[]): RallyState => ({
  ...s,
  deck: { drawPile: [], discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
})
const intents = (s: RallyState) => intentTexts(s, previewEvents(s).enemy, wordNamer(s))

test('적 예고: 문장과 그 적이 낼 수치', () => {
  const s = startRally('test-dummy', DECK, 1).state
  expect(intents(s)).toEqual({ e0: '거미가 당신을 물어뜯는다 — 피해 7' })
})

test('적 예고: 봉인은 다음에 봉인될 내 칸을 말한다', () => {
  const s = startRally('test-text-seal', DECK, 1).state
  expect(intents(s)).toEqual({ e0: '필경사가 당신의 주어 칸을 봉인한다' })
})

test('내 문장: 빈칸은 낭독하면 채워질 대상 이름으로, 동사가 없으면 빈 동사로 보인다', () => {
  const s = withHand(startRally('test-dummy', DECK, 1).state, ['bite', 'fiercely'])
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
  const turn2 = act(startRally('spider', DECK, 1).state, { type: 'endTurn' })
  const text = intents(turn2).e0 ?? ''
  expect(text).toContain('독을 뿜는')
  expect(text).toMatch(/피해 \d+, 독 \+\d+/)
})

test('적 예고: 같은 턴에 둘이 봉인하면 순서대로 다음 칸을 말한다', () => {
  const s = startRally('test-seal-two', DECK, 1).state
  expect(intents(s)).toEqual({ e0: '필경사 1이 당신의 주어 칸을 봉인한다', e1: '필경사 2가 당신의 목적어 칸을 봉인한다' })
})

test('적 예고: 얼어 있는 적은 빙결로 무효라고 말하고, 봉인 순서에서도 빠진다', () => {
  const s = startRally('test-seal-two', DECK, 1).state
  const frozen: RallyState = { ...s, entities: s.entities.map((e) => (e.id === 'e0' ? { ...e, statuses: { ...e.statuses, freeze: 1 } } : e)) }
  expect(intents(frozen)).toEqual({
    e0: '필경사 1이 당신의 주어 칸을 봉인한다 — 빙결로 무효',
    e1: '필경사 2가 당신의 주어 칸을 봉인한다',
  })
})

test('남을 상태: 지금 문장대로 낭독하면 남을 형용사 상태를 개체별로 보인다', () => {
  const base = withHand(startRally('test-dummy', DECK, 1).state, ['bite', 'blind', 'blind'])
  const verb = act(base, { type: 'place', instanceId: 'h0', at: { clause: 0, role: 'verb' } })
  const one = act(verb, { type: 'place', instanceId: 'h1', at: { clause: 0, role: 'object' } })
  expect(lingeringTexts(one)).toEqual({ e0: ['눈멂 · 적 차례까지'] })
  const two = act(one, { type: 'place', instanceId: 'h2', at: { clause: 0, role: 'object' } })
  expect(lingeringTexts(two)).toEqual({ e0: ['눈멂 ×2 · 적 차례까지'] })
  const noVerb = act(base, { type: 'place', instanceId: 'h1', at: { clause: 0, role: 'object' } })
  expect(lingeringTexts(noVerb)).toEqual({})
})

test('eventNotice: 거절 사유가 먼저이고, 없으면 서고 바닥·손패 넘침·떠올리기를 잇는다', () => {
  expect(eventNotice([{ type: 'rejected', reason: 'noVerb', at: null }, { type: 'emptyDraw', missing: 1, hpLost: 2 }])).toBe(REJECT_MESSAGES.noVerb)
  expect(eventNotice([{ type: 'emptyDraw', missing: 2, hpLost: 4 }, { type: 'recalled', count: 3 }])).toBe('서고가 비어 HP 4 잃음 · 망각에서 3장을 떠올림')
  expect(eventNotice([{ type: 'burned', wordId: 'bite' }])).toBe('손패가 가득 차 물어뜯는다은(는) 망각으로')
  expect(eventNotice([{ type: 'cast', by: 'player' }])).toBe('')
})

describe('막는다 문구: 빈 목적어가 주어와 같으면 생략', () => {
  const V = { clause: 0, role: 'verb' } as const
  const O = { clause: 0, role: 'object' } as const
  test('"당신이 막는다"', () => {
    const s = act(withHand(startRally('test-dummy', DECK, 1).state, ['guard']), { type: 'place', instanceId: 'h0', at: V })
    expect(sentenceText(s)[0]).toBe('당신이 막는다')
    expect(omitsObject(s, 0)).toBe(true)
  })
  test('목적어를 직접 놓으면 쓴다: "당신이 허수아비를 막는다"', () => {
    let s = withHand(startRally('test-dummy', DECK, 1).state, ['guard', 'scarecrow'])
    s = act(act(s, { type: 'place', instanceId: 'h0', at: V }), { type: 'place', instanceId: 'h1', at: O })
    expect(sentenceText(s)[0]).toBe('당신이 허수아비를 막는다')
    expect(omitsObject(s, 0)).toBe(false)
  })
  test('공격 동사의 빈 목적어는 생략하지 않는다', () => {
    const s = act(withHand(startRally('test-dummy', DECK, 1).state, ['bite']), { type: 'place', instanceId: 'h0', at: V })
    expect(omitsObject(s, 0)).toBe(false)
  })
})
