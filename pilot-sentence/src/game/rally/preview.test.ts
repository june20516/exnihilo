import { CHARACTERS, DEFAULT_CHARACTER } from '@/game/content/characters'
import { createRng, nextInt, type RngState } from '@/kit/core/rng'
import { getWord, type WordId } from '@/game/content/words'
import { type CardInst, type RallyAction, type RallyState, reduceRally, runSentence, startRally } from './combat'
import { PLAYER_ID } from '@/game/content/characters'
import { type BuildState, EMPTY_BUILD, type RelicId } from '@/game/build/build'
import type { CombatEvent } from '@/game/combat/events'
import { sentenceCalc } from './formula'
import { sentenceFormula } from './formulaText'
import { addBlock } from '@/kit/core/entity'
import { previewEvents, previewRound } from './preview'
import './testFixtures'

const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a).state
const FILLER: CardInst[] = Array.from({ length: 12 }, (_, i) => ({ instanceId: `f${i}`, wordId: 'bite' }))
const withHand = (words: WordId[]): RallyState => ({
  ...startRally('test-dummy', CHARACTERS[DEFAULT_CHARACTER].starterDeck, 1).state,
  // 서고를 넉넉히 두어 서고 바닥 대가(v3)가 미리보기에 끼어들지 않게 한다.
  deck: { drawPile: FILLER, discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
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
const PROPERTY_DECK: WordId[] = [...CHARACTERS[DEFAULT_CHARACTER].starterDeck, 'and', 'so', 'while', 'giant', 'twice', 'curse', 'counter', 'endure']

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
  let state = startRally(encounterId, PROPERTY_DECK, seed, { build: randomBuild(seed) }).state
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
  const base = startRally('test-dummy', CHARACTERS[DEFAULT_CHARACTER].starterDeck, 1, { build: { ...EMPTY_BUILD, upgrades: { bite: 1, fiercely: 1 } } }).state
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
  const verbs: WordId[] = ['bite', 'slash', 'bite', 'scare', 'curse', 'rage', 'guard', 'counter']
  const modifiers: WordId[] = ['fiercely', 'hungry', 'cracked', 'venomous', 'giant', 'twice', 'blind']
  const words: WordId[] = [pick(verbs), pick(['and', 'so', 'while'] as const), pick(verbs)]
  const [modifierCount, next] = nextInt(rng, 0, 3)
  rng = next
  for (let i = 0; i < modifierCount; i++) words.push(pick(modifiers))
  const base = startRally(encounterId, PROPERTY_DECK, seed, { build: randomBuild(seed) }).state
  // 되받아친다가 위력을 갖도록 플레이어에게 보호를 준다(시드마다 0~12).
  const block = (seed * 7) % 13
  const entities = base.entities.map((e) => (e.id === PLAYER_ID && block > 0 ? addBlock(e, block, 1) : e))
  let s: RallyState = { ...base, entities, deck: { drawPile: [], discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) } }
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

const biteWith = (edit: (s: RallyState) => RallyState) => {
  const s = act(edit(withHand(['bite'])), { type: 'place', instanceId: 'h0', at: V })
  return sentenceFormula(s)[0]?.text
}
const withStatus = (side: 'ally' | 'enemy', status: 'weak' | 'vulnerable') => (s: RallyState): RallyState => ({
  ...s,
  entities: s.entities.map((e) => (e.side === side ? { ...e, statuses: { ...e.statuses, [status]: 2 } } : e)),
})

test('계산식: 약화·취약 항에 이름표가 붙는다', () => {
  expect(biteWith(withStatus('ally', 'weak'))).toBe('6 × 0.75(약화) = 4')
  expect(biteWith(withStatus('enemy', 'vulnerable'))).toBe('6 × 1.5(취약) = 9')
})

test('계산식: 값이 적의 남은 HP 이상이면 처치와 남은 HP를 밝힌다(미리보기 피해는 남은 HP에서 잘리므로)', () => {
  const weak = (s: RallyState): RallyState => ({ ...s, entities: s.entities.map((e) => (e.side === 'enemy' ? { ...e, hp: 3 } : e)) })
  expect(biteWith(weak)).toBe('6 = 6 → 처치(남은 HP 3)')
  expect(biteWith((s) => s)).toBe('6 = 6')
})

test('끌어안는다: 내 쪽 피해에는 유물 보너스가 붙고(되받는 피해는 그대로), 계산식도 보인다', () => {
  const base = startRally('test-dummy', CHARACTERS[DEFAULT_CHARACTER].starterDeck, 1, { build: { ...EMPTY_BUILD, relics: ['ellipsis'] } }).state
  let s: RallyState = { ...base, deck: { drawPile: [], discardPile: [], hand: [{ instanceId: 'h0', wordId: 'embrace' }] } }
  s = act(s, { type: 'place', instanceId: 'h0', at: V })
  const hits = previewEvents(s).mine.filter((e) => e.type === 'damaged')
  expect(hits.map((e) => (e.type === 'damaged' ? [e.entityId, e.amount] : []))).toEqual([['e0', 8], [PLAYER_ID, 4]])
  expect(sentenceFormula(s)[0]?.text).toBe('4 + 유물 4 = 8')
})

test('계산식: 무효가 될 절은 값 대신 이유를 보인다(대상이 먼저 쓰러짐, 주어 빙결)', () => {
  const base = startRally('test-dummy', CHARACTERS[DEFAULT_CHARACTER].starterDeck, 1).state
  const hand: CardInst[] = [{ instanceId: 'h0', wordId: 'bite' }, { instanceId: 'h1', wordId: 'and' }, { instanceId: 'h2', wordId: 'bite' }]
  let s: RallyState = { ...base, entities: base.entities.map((e) => (e.side === 'enemy' ? { ...e, hp: 3 } : e)), deck: { drawPile: [], discardPile: [], hand } }
  s = act(s, { type: 'place', instanceId: 'h0', at: V })
  s = act(s, { type: 'connect', instanceId: 'h1' })
  s = act(s, { type: 'place', instanceId: 'h2', at: { clause: 1, role: 'verb' } })
  expect(sentenceFormula(s).map((f) => f.text)).toEqual(['6 = 6 → 처치(남은 HP 3)', '무효(대상 없음)'])

  const frozen = act(
    { ...withHand(['bite']), entities: withHand(['bite']).entities.map((e) => (e.side === 'ally' ? { ...e, statuses: { ...e.statuses, freeze: 1 } } : e)) },
    { type: 'place', instanceId: 'h0', at: V },
  )
  expect(sentenceFormula(frozen)[0]).toMatchObject({ text: '무효(빙결)', value: 0 })
})

test('미리보기의 적 차례 피해에 남은 상태(눈먼)가 반영된다', () => {
  const base = withHand(['bite', 'blind'])
  let s = act(base, { type: 'place', instanceId: 'h0', at: V })
  s = act(s, { type: 'place', instanceId: 'h1', at: O })
  expect(texts(previewRound(s).enemy)).toEqual(['거미 → 탐험가: 피해 3'])
})

test('미리보기: 서고 바닥 HP 손실이 이어서 적의 차례에 실제와 같은 수치로 보인다', () => {
  const s = act({ ...withHand(['bite']), deck: { drawPile: [], discardPile: [], hand: [{ instanceId: 'h0', wordId: 'bite' }] } }, { type: 'place', instanceId: 'h0', at: V })
  const p = previewRound(s)
  expect(texts(p.enemy)).toContain('탐험가: 서고가 비어 HP 12 잃음')
  const real = reduceRally(s, { type: 'cast' }).events
  expect(real).toContainEqual({ type: 'emptyDraw', missing: 6, hpLost: 12 })
})

/**
 * 반복 전체: 절마다 첫 대상이 받은 피해(막힌 양 포함)의 합이 계산식의 반복 합과 같다.
 * 반복 합 = 첫 값 + 이후 값 × (반복 − 1). 대상이 쓰러졌으면(과잉 피해가 잘림) 계산식이 그 이상이어야 한다.
 */
function expectRepeatTotals(state: RallyState, label: string): number {
  let checked = 0
  const groups = eventsByClause(previewEvents(state).mine)
  const runs = runSentence(state).clauses
  const calcs = sentenceCalc(state)
  for (const calc of calcs) {
    if (calc.fizzle) continue
    const hits = (groups[calc.clause] ?? []).filter((e): e is Extract<CombatEvent, { type: 'damaged' }> => e.type === 'damaged')
    const first = hits[0]
    if (!first) continue
    const onTarget = hits.filter((h) => h.entityId === first.entityId && h.sourceId === first.sourceId)
    const dealt = onTarget.reduce((sum, h) => sum + h.amount + h.blocked, 0)
    const total = calc.value + (calc.laterValue ?? calc.value) * (calc.repeat - 1)
    const targetHp = runs[calc.clause]?.entitiesBefore.find((e) => e.id === first.entityId)
    const died = targetHp !== undefined && onTarget.reduce((sum, h) => sum + h.amount, 0) >= targetHp.hp
    if (died) expect(total, label).toBeGreaterThanOrEqual(dealt)
    else expect(total, `${label} clause ${calc.clause}`).toBe(dealt)
    checked++
  }
  return checked
}

test.each(['spider', 'swarm', 'slime'])('반복 전체: 계산식의 반복 합이 실제 피해 합과 같다(되받아친다 포함): %s', (encounterId) => {
  let checked = 0
  for (let seed = 1; seed <= 80; seed++) checked += expectRepeatTotals(twoClauseState(encounterId, seed), `seed ${seed}`)
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const state of randomStates(encounterId, seed)) checked += expectRepeatTotals(state, `random ${seed}`)
  expect(checked).toBeGreaterThan(30)
})

test('되받아친다 + 두 번: 첫 반복이 보호를 다 쓰므로 둘째 반복은 0이고, 계산식도 그렇게 보인다', () => {
  const base = withHand(['counter', 'twice'])
  const guarded = { ...base, entities: base.entities.map((e) => (e.id === PLAYER_ID ? addBlock(e, 8, 1) : e)) }
  const s = act(act(guarded, { type: 'place', instanceId: 'h0', at: V }), { type: 'place', instanceId: 'h1', at: V, modifierIndex: 0 })
  const [calc] = sentenceCalc(s)
  expect(calc).toMatchObject({ value: 8, laterValue: 0, repeat: 2, lethalHp: null })
  expect(sentenceFormula(s)[0]?.text).toBe('보호 8 = 8 (이후 1회는 0)')
  const hits = reduceRally(s, { type: 'cast' }).events.filter((e) => e.type === 'damaged' && e.entityId === 'e0')
  expect(hits.map((h) => (h.type === 'damaged' ? h.amount + h.blocked : -1))).toEqual([8, 0])
})

describe('계산식 항의 출처', () => {
  test("[격렬하게] 물어뜯는다: 기본 출처 '물어뜯는다', 배율 항 sources ['격렬하게']", () => {
    const s = act(act(withHand(['bite', 'fiercely']), { type: 'place', instanceId: 'h0', at: V }), { type: 'place', instanceId: 'h1', at: V, modifierIndex: 0 })
    const [calc] = sentenceCalc(s)
    expect(calc?.baseSource).toBe('물어뜯는다')
    expect(calc?.terms.find((t) => t.kind === 'times' && t.factor === 1.5)?.sources).toEqual(['격렬하게'])
  })
  test("긴 문장 유물이 있으면 가산 항 sources에 '긴 문장'", () => {
    const base = startRally('test-dummy', CHARACTERS[DEFAULT_CHARACTER].starterDeck, 1, { build: { ...EMPTY_BUILD, relics: ['longSentence'] } }).state
    const s = act({ ...base, deck: { drawPile: FILLER, discardPile: [], hand: [{ instanceId: 'h0', wordId: 'bite' }] } }, { type: 'place', instanceId: 'h0', at: V })
    const [calc] = sentenceCalc(s)
    expect(calc?.terms.find((t) => t.kind === 'plus' && t.label === 'relic')?.sources).toEqual(['긴 문장'])
  })
  test("되받아친다의 기본 출처는 '보호'", () => {
    const base = withHand(['counter'])
    const s = act({ ...base, entities: base.entities.map((e) => (e.id === PLAYER_ID ? addBlock(e, 5, 0) : e)) }, { type: 'place', instanceId: 'h0', at: V })
    expect(sentenceCalc(s)[0]?.baseSource).toBe('보호')
  })
})
