import { createRng, nextInt, type RngState } from '@/kit/core/rng'
import { BALANCE } from '@/game/content/balance'
import { RALLY_ENCOUNTERS, RALLY_STARTER_DECK } from '@/game/content/enemies'
import type { ClauseSpec } from '@/game/content/encounters'
import type { WordId } from '@/game/content/words'
import { type CardInst, type RallyAction, type RallyState, reduceRally, startRally } from './combat'
import { sentenceFormula } from './formula'
import { previewEvents, previewRound } from './preview'

const clause = (subject: WordId, verb: WordId): ClauseSpec => ({
  frameId: 'transitive',
  slots: [{ role: 'subject', head: subject }, { role: 'object', head: 'you' }, { role: 'verb', head: verb }],
})
RALLY_ENCOUNTERS['test-preview'] = {
  id: 'test-preview',
  name: '시험 거미',
  enemies: [{ defId: 'spider', name: '거미', hp: 30, row: 'front', portrait: '', intents: [clause('spider', 'spiderBite')] }],
}

const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a, BALANCE).state
const withHand = (words: WordId[]): RallyState => ({
  ...startRally('test-preview', RALLY_STARTER_DECK, 1, BALANCE).state,
  deck: { drawPile: [], discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
})
const texts = (lines: readonly { text: string }[]) => lines.map((l) => l.text)

test('미리보기: 내 낭독과 적의 차례가 나뉜다', () => {
  const p = previewRound(act(withHand(['bite']), { type: 'place', instanceId: 'h0', at: V }))
  expect(texts(p.mine)).toEqual(['탐험가 → 거미: 피해 6'])
  expect(texts(p.enemy)).toEqual(['거미 → 탐험가: 피해 7'])
})

test('미리보기: 막으면 적의 차례 피해가 줄어 보인다', () => {
  const p = previewRound(act(withHand(['guard']), { type: 'place', instanceId: 'h0', at: V }))
  expect(texts(p.mine)).toEqual(['탐험가: 보호 +6'])
  expect(texts(p.enemy)).toEqual(['거미 → 탐험가: 피해 1 (막음 6)'])
})

test('미리보기: 동사가 없으면 mine은 비고 적의 차례만', () => {
  const p = previewRound(withHand(['fiercely']))
  expect(p.mine).toEqual([])
  expect(texts(p.enemy)).toEqual(['거미 → 탐험가: 피해 7'])
})

describe('계산식', () => {
  const build = (placements: [WordId, typeof S | typeof O | typeof V][]) => {
    let s = withHand(placements.map(([w]) => w))
    placements.forEach(([, at], i) => {
      s = act(s, { type: 'place', instanceId: `h${i}`, at })
    })
    return sentenceFormula(s)
  }

  test('동사가 없으면 null', () => expect(sentenceFormula(withHand(['bite']))).toBeNull())
  test('동사만 → "6 = 6"', () => expect(build([['bite', V]])).toEqual({ text: '6 = 6', value: 6 }))
  test('[격렬하게] → "6 × 1.5 = 9"', () => expect(build([['bite', V], ['fiercely', V]])?.text).toBe('6 × 1.5 = 9'))
  test('[굶주린] 주어 + [금이 간] 목적어 + [격렬하게] → "(6 × 1.5 + 4) × 1.5 = 19"', () => {
    expect(build([['bite', V], ['hungry', S], ['cracked', O], ['fiercely', V]])?.text).toBe('(6 × 1.5 + 4) × 1.5 = 19')
  })
  test('막는다 [격렬하게] → "6 × 1.5 = 9"', () => expect(build([['guard', V], ['fiercely', V]])?.text).toBe('6 × 1.5 = 9'))
  test('힘이 있으면 항으로 보인다', () => {
    const s = act(withHand(['bite']), { type: 'place', instanceId: 'h0', at: V })
    const strong = { ...s, entities: s.entities.map((e) => (e.id === 'p' ? { ...e, statuses: { ...e.statuses, strength: 2 } } : e)) }
    expect(sentenceFormula(strong)?.text).toBe('6 + 힘 2 = 8')
  })
})

/** 무작위로 몇 수 둔 상태들(거부된 수는 상태를 바꾸지 않는다). */
function randomStates(encounterId: string, seed: number): RallyState[] {
  let state = startRally(encounterId, RALLY_STARTER_DECK, seed, BALANCE).state
  let rng: RngState = createRng(seed)
  const roles = ['subject', 'object', 'verb'] as const
  const states: RallyState[] = []
  for (let step = 0; step < 60 && state.phase === 'player'; step++) {
    states.push(state)
    const [kind, r1] = nextInt(rng, 0, 9)
    const [pick, r2] = nextInt(r1, 0, Math.max(0, state.deck.hand.length - 1))
    const [role, r3] = nextInt(r2, 0, 2)
    const [mod, r4] = nextInt(r3, -1, 1)
    rng = r4
    const card = state.deck.hand[pick]
    const action: RallyAction =
      kind === 0 ? { type: 'cast' } : kind === 1 ? { type: 'endTurn' } : card
        ? { type: 'place', instanceId: card.instanceId, at: { clause: 0, role: roles[role] }, modifierIndex: mod < 0 ? undefined : mod }
        : { type: 'endTurn' }
    state = act(state, action)
  }
  return states
}

test.each(['spider', 'swarm', 'slime'])('계산식의 값은 실제 첫 피해(막힌 양 포함, 과잉 피해는 잘림)와 같다: %s', (encounterId) => {
  let checked = 0
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const state of randomStates(encounterId, seed)) {
      const formula = sentenceFormula(state)
      const firstHit = previewEvents(state).mine.find((e) => e.type === 'damaged')
      if (!formula || !firstHit || firstHit.type !== 'damaged') continue
      // 피해 기록은 남은 HP에서 잘린다(과잉 피해). 그때는 계산식 값이 그 이상이어야 한다.
      const targetHp = state.entities.find((e) => e.id === firstHit.entityId)?.hp ?? 0
      if (firstHit.amount === targetHp) expect(formula.value).toBeGreaterThanOrEqual(firstHit.amount + firstHit.blocked)
      else expect(formula.value).toBe(firstHit.amount + firstHit.blocked)
      checked++
    }
  }
  expect(checked).toBeGreaterThan(5)
})
