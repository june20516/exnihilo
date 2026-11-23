import { createRng, nextInt, type RngState } from '@/kit/core/rng'
import { BALANCE } from '@/game/content/balance'
import { RALLY_STARTER_DECK } from '@/game/content/enemies'
import { getWord, type WordId } from '@/game/content/words'
import { type CardInst, type RallyAction, type RallyState, reduceRally, runSentence, startRally } from './combat'
import { type BuildState, EMPTY_BUILD, type RelicId } from '@/game/build/build'
import type { CombatEvent } from '@/game/combat/events'
import { sentenceFormula } from './formula'
import { previewEvents, previewRound } from './preview'
import './testFixtures'

const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a, BALANCE).state
const withHand = (words: WordId[]): RallyState => ({
  ...startRally('test-dummy', RALLY_STARTER_DECK, 1, BALANCE).state,
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
    return sentenceFormula(s)[0]
  }

  test('동사가 없으면 빈 목록', () => expect(sentenceFormula(withHand(['bite']))).toEqual([]))
  test('동사만 → "6 = 6"', () => expect(build([['bite', V]])).toEqual({ clause: 0, text: '6 = 6', value: 6 }))
  test('[격렬하게] → "6 × 1.5 = 9"', () => expect(build([['bite', V], ['fiercely', V]])?.text).toBe('6 × 1.5 = 9'))
  test('[굶주린] 주어 + [금이 간] 목적어 + [격렬하게] → "(6 × 1.5 + 4) × 1.5 = 19"', () => {
    expect(build([['bite', V], ['hungry', S], ['cracked', O], ['fiercely', V]])?.text).toBe('(6 × 1.5 + 4) × 1.5 = 19')
  })
  test('막는다 [격렬하게] → "6 × 1.5 = 9"', () => expect(build([['guard', V], ['fiercely', V]])?.text).toBe('6 × 1.5 = 9'))
  test('힘이 있으면 항으로 보인다', () => {
    const s = act(withHand(['bite']), { type: 'place', instanceId: 'h0', at: V })
    const strong = { ...s, entities: s.entities.map((e) => (e.id === 'p' ? { ...e, statuses: { ...e.statuses, strength: 2 } } : e)) }
    expect(sentenceFormula(strong)[0]?.text).toBe('6 + 힘 2 = 8')
  })
})

const RELIC_IDS: RelicId[] = ['longSentence', 'adjectiveChain', 'stress', 'ellipsis', 'scarecrowSpeaker', 'poisonGrammar', 'resonance', 'echo']
const PROPERTY_DECK: WordId[] = [...RALLY_STARTER_DECK, 'and', 'so', 'while', 'giant', 'twice', 'curse']

/** 시드로 정한 무작위 빌드: 유물 0~3개, 강화 0~2개. */
function randomBuild(seed: number): BuildState {
  let rng: RngState = createRng(seed * 7919)
  const pick = <T,>(items: readonly T[]): T => {
    const [i, next] = nextInt(rng, 0, items.length - 1)
    rng = next
    return items[i]
  }
  const [relicCount, r1] = nextInt(rng, 0, 3)
  const [upgradeCount, r2] = nextInt(r1, 0, 2)
  rng = r2
  const relics = [...new Set(Array.from({ length: relicCount }, () => pick(RELIC_IDS)))]
  const upgrades: Record<WordId, 1 | 2> = {}
  for (let i = 0; i < upgradeCount; i++) upgrades[pick(PROPERTY_DECK)] = pick([1, 2] as const)
  return { ...EMPTY_BUILD, relics, upgrades }
}

/** 무작위로 몇 수 둔 상태들(거부된 수는 상태를 바꾸지 않는다). 연결어와 둘째 절 배치를 섞는다. */
function randomStates(encounterId: string, seed: number): RallyState[] {
  let state = startRally(encounterId, PROPERTY_DECK, seed, BALANCE, { build: randomBuild(seed) }).state
  let rng: RngState = createRng(seed)
  // 동사 칸을 절반 확률로 고른다(낭독할 수 있는 상태가 충분히 나오도록).
  const roles = ['subject', 'object', 'verb', 'verb', 'verb', 'verb'] as const
  const states: RallyState[] = []
  for (let step = 0; step < 60 && state.phase === 'player'; step++) {
    states.push(state)
    const [kind, r1] = nextInt(rng, 0, 9)
    const [pick, r2] = nextInt(r1, 0, Math.max(0, state.deck.hand.length - 1))
    const [role, r3] = nextInt(r2, 0, roles.length - 1)
    const [mod, r4] = nextInt(r3, -1, 1)
    const [clause, r5] = nextInt(r4, 0, state.board.clauses.length - 1)
    rng = r5
    const card = state.deck.hand[pick]
    const isConnective = card !== undefined && getWord(card.wordId).kind === 'connective'
    const action: RallyAction =
      kind === 0 ? { type: 'cast' } : kind === 1 ? { type: 'endTurn' } : card && isConnective ? { type: 'connect', instanceId: card.instanceId } : card
        ? { type: 'place', instanceId: card.instanceId, at: { clause, role: roles[role] }, modifierIndex: mod < 0 ? undefined : mod }
        : { type: 'endTurn' }
    state = act(state, action)
  }
  return states
}

/** 내 낭독 이벤트를 절별로 나눈다(clauseExecuted가 절의 시작). */
function eventsByClause(events: readonly CombatEvent[]): CombatEvent[][] {
  const groups: CombatEvent[][] = []
  for (const e of events) {
    if (e.type === 'clauseExecuted') groups[e.clause] = []
    else groups[groups.length - 1]?.push(e)
  }
  return groups
}

test.each(['spider', 'swarm', 'slime'])('계산식의 값은 절마다 실제 첫 피해(막힌 양 포함, 과잉 피해는 잘림)와 같다: %s', (encounterId) => {
  let checked = 0
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const state of randomStates(encounterId, seed)) {
      const groups = eventsByClause(previewEvents(state).mine)
      const runs = runSentence(state).clauses
      for (const formula of sentenceFormula(state)) {
        const firstHit = groups[formula.clause]?.find((e) => e.type === 'damaged')
        if (!firstHit || firstHit.type !== 'damaged') continue
        // 피해 기록은 남은 HP에서 잘린다(과잉 피해). 그때는 계산식 값이 그 이상이어야 한다.
        const targetHp = runs[formula.clause]?.entitiesBefore.find((e) => e.id === firstHit.entityId)?.hp ?? 0
        const label = `seed ${seed} clause ${formula.clause}: ${formula.text}`
        if (firstHit.amount === targetHp) expect(formula.value, label).toBeGreaterThanOrEqual(firstHit.amount + firstHit.blocked)
        else expect(formula.value, label).toBe(firstHit.amount + firstHit.blocked)
        checked++
      }
    }
  }
  expect(checked).toBeGreaterThan(5)
})

test('계산식은 강화를 반영한다: 물어뜯는다★ + 격렬하게★ → "9 × 2 = 18"', () => {
  const base = startRally('test-dummy', RALLY_STARTER_DECK, 1, BALANCE, { build: { ...EMPTY_BUILD, upgrades: { bite: 1, fiercely: 1 } } }).state
  let s: RallyState = { ...base, deck: { drawPile: [], discardPile: [], hand: [{ instanceId: 'h0', wordId: 'bite' }, { instanceId: 'h1', wordId: 'fiercely' }] } }
  s = act(s, { type: 'place', instanceId: 'h0', at: V })
  s = act(s, { type: 'place', instanceId: 'h1', at: V })
  expect(sentenceFormula(s)[0]?.text).toBe('9 × 2 = 18')
})

/** 시드로 정한 두 절 상태: 무작위 빌드에서 동사 + 연결어 + 동사, 수식어 0~3장을 두 절에 흩어 놓는다. */
function twoClauseState(encounterId: string, seed: number): RallyState {
  let rng: RngState = createRng(seed * 104729)
  const pick = <T,>(items: readonly T[]): T => {
    const [i, next] = nextInt(rng, 0, items.length - 1)
    rng = next
    return items[i]
  }
  const verbs: WordId[] = ['bite', 'slash', 'bite', 'scare', 'curse', 'rage', 'guard']
  const modifiers: WordId[] = ['fiercely', 'hungry', 'cracked', 'venomous', 'giant', 'twice', 'blind']
  const words: WordId[] = [pick(verbs), pick(['and', 'so', 'while'] as const), pick(verbs)]
  const [modifierCount, next] = nextInt(rng, 0, 3)
  rng = next
  for (let i = 0; i < modifierCount; i++) words.push(pick(modifiers))
  const base = startRally(encounterId, PROPERTY_DECK, seed, BALANCE, { build: randomBuild(seed) }).state
  let s: RallyState = { ...base, deck: { drawPile: [], discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) } }
  s = act(s, { type: 'place', instanceId: 'h0', at: { clause: 0, role: 'verb' } })
  s = act(s, { type: 'connect', instanceId: 'h1' })
  s = act(s, { type: 'place', instanceId: 'h2', at: { clause: 1, role: 'verb' } })
  for (let i = 3; i < words.length; i++) {
    const kind = getWord(words[i]).kind
    const role = kind === 'adverb' ? 'verb' : pick(['subject', 'object'] as const)
    s = act(s, { type: 'place', instanceId: `h${i}`, at: { clause: pick([0, 1]), role } })
  }
  return s
}

test.each(['spider', 'swarm', 'slime'])('두 절: 절마다 계산식의 값이 실제 첫 피해와 같다(그래서·그러면서 포함): %s', (encounterId) => {
  let secondChecked = 0
  for (let seed = 1; seed <= 80; seed++) {
    const state = twoClauseState(encounterId, seed)
    const groups = eventsByClause(previewEvents(state).mine)
    const runs = runSentence(state).clauses
    for (const formula of sentenceFormula(state)) {
      const firstHit = groups[formula.clause]?.find((e) => e.type === 'damaged')
      if (!firstHit || firstHit.type !== 'damaged') continue
      const targetHp = runs[formula.clause]?.entitiesBefore.find((e) => e.id === firstHit.entityId)?.hp ?? 0
      const label = `seed ${seed} clause ${formula.clause} ${state.connective?.wordId}: ${formula.text}`
      if (firstHit.amount === targetHp) expect(formula.value, label).toBeGreaterThanOrEqual(firstHit.amount + firstHit.blocked)
      else expect(formula.value, label).toBe(firstHit.amount + firstHit.blocked)
      if (formula.clause === 1) secondChecked++
    }
  }
  expect(secondChecked).toBeGreaterThan(15)
})
