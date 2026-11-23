import { BALANCE } from '@/game/content/balance'
import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import type { WordId } from '@/game/content/words'
import { type CardInst, type RallyAction, type RallyState, reduceRally, startRally } from './combat'
import { previewEvents } from './preview'
import { intentTexts, REJECT_MESSAGES, sentenceText, wordNamer } from './text'
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
const intents = (s: RallyState) => intentTexts(s, previewEvents(s).enemy, wordNamer(s))

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
