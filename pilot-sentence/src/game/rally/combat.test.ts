import { addBlock } from '@/kit/core/entity'
import { createRng, nextInt, type RngState } from '@/kit/core/rng'
import type { WordId } from '@/game/content/words'
import { getSlot, playerWordsOnBoard } from '@/game/sentence/board'
import { applyStructure, type BuildState, EMPTY_BUILD } from '@/game/build/build'
import { type CardInst, type RallyAction, type RallyOptions, type RallyState, reduceRally, startRally } from './combat'
import { hasVerb } from './sentence'
import './testFixtures'

const DECK: WordId[] = ['bite', 'bite', 'bite', 'slash', 'guard', 'guard', 'hide', 'rage', 'scare', 'mend', 'fiercely', 'fiercely', 'hungry', 'cracked', 'venomous']
const V = { clause: 0, role: 'verb' } as const
const start = (encounterId = 'test-dummy') => startRally(encounterId, DECK, 123).state
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a)
const hp = (s: RallyState, id: string) => s.entities.find((e) => e.id === id)?.hp
const block = (s: RallyState, id: string) => s.entities.find((e) => e.id === id)?.statuses.block
const cards = (words: WordId[], prefix = 'h'): CardInst[] => words.map((wordId, i) => ({ instanceId: `${prefix}${i}`, wordId }))
const withHand = (s: RallyState, words: WordId[], drawPile: CardInst[] = []): RallyState => ({
  ...s,
  deck: { drawPile, discardPile: [], hand: cards(words) },
})
/** 서고를 넉넉히 두어 서고 바닥 대가(v3)가 끼어들지 않게 한다. */
const FILLER: CardInst[] = cards(Array.from({ length: 12 }, () => 'bite' as WordId), 'f')
const castVerb = (s: RallyState, verb: WordId) => act(act(withHand(s, [verb], FILLER), { type: 'place', instanceId: 'h0', at: V }).state, { type: 'cast' })

test('시작: 손패 6, 1턴, 버리기 1, 대상은 첫 적, 동사 없음', () => {
  const s = start()
  expect(s.deck.hand).toHaveLength(6)
  expect(s).toMatchObject({ turn: 1, discardsLeft: 1, targetId: 'e0', phase: 'player' })
  expect(hasVerb(s.board)).toBe(false)
})

test('동사 없이 낭독하면 거부되고 상태는 그대로', () => {
  const s = start()
  const r = act(s, { type: 'cast' })
  expect(r.events[0]).toMatchObject({ type: 'rejected', reason: 'noVerb' })
  expect(r.state).toBe(s)
})

test('동사 한 장 낭독 → 적 피해 6, 적 반격 7, 2턴, 카드는 버림 더미, 문장은 빈칸', () => {
  const s = withHand(start(), ['bite'], cards(['guard', 'guard', 'hide', 'rage', 'scare', 'mend'], 'd'))
  const r = act(act(s, { type: 'place', instanceId: 'h0', at: V }).state, { type: 'cast' })
  expect(hp(r.state, 'e0')).toBe(24)
  expect(hp(r.state, 'p')).toBe(53)
  expect(r.state.turn).toBe(2)
  expect(r.state.deck.discardPile.map((c) => c.instanceId)).toContain('h0')
  expect(hasVerb(r.state.board)).toBe(false)
  expect(r.events).toContainEqual({ type: 'enemyTurn' })
})

test('막는다 낭독 → 반격 7 중 6을 막고, 다 쓴 보호는 남지 않는다', () => {
  const r = castVerb(start(), 'guard')
  expect(hp(r.state, 'p')).toBe(59)
  expect(block(r.state, 'p')).toBe(0)
})

test('낭독 없이 턴 종료 → 놓았던 카드는 손패로 돌아온다', () => {
  const placed = act(withHand(start(), ['bite', 'fiercely']), { type: 'place', instanceId: 'h0', at: V }).state
  const r = act(placed, { type: 'endTurn' })
  expect(r.state.deck.hand.map((c) => c.instanceId)).toEqual(expect.arrayContaining(['h0', 'h1']))
  expect(hp(r.state, 'e0')).toBe(30)
})

test('손패는 이월되고 최대치(6)까지만 채워, 넘쳐서 버려지는 카드가 없다', () => {
  const s = withHand(start(), ['bite', 'bite', 'bite', 'guard'], cards(['scare', 'mend', 'slash', 'hungry', 'cracked'], 'd'))
  const r = act(s, { type: 'endTurn' })
  expect(r.state.deck.hand).toHaveLength(6)
  expect(r.state.deck.drawPile).toHaveLength(3)
  expect(r.events.filter((e) => e.type === 'burned')).toHaveLength(0)
})

test('버리기: 같은 장수를 뽑고, 두 번째는 noDiscardLeft', () => {
  const s = withHand(start(), ['bite', 'guard', 'rage'], cards(['scare', 'mend', 'slash'], 'd'))
  const r = act(s, { type: 'discard', instanceIds: ['h0', 'h1'] })
  expect(r.state.deck.hand).toHaveLength(3)
  expect(r.state.deck.hand.map((c) => c.instanceId)).toEqual(['h2', 'd0', 'd1'])
  expect(r.state.discardsLeft).toBe(0)
  expect(r.events).toContainEqual({ type: 'discarded', count: 2 })
  expect(act(r.state, { type: 'discard', instanceIds: ['h2'] }).events[0]).toMatchObject({ reason: 'noDiscardLeft' })
})

test('버리기: 서고가 비어 있으면 망각을 섞지 않고 덜 뽑으며, 못 뽑은 장수만큼 대가를 치른다', () => {
  const base = withHand(start(), ['bite', 'guard'])
  const earlier = { ...base, deck: { ...base.deck, discardPile: cards(['hide', 'rage'], 'd') } }
  const r = act(earlier, { type: 'discard', instanceIds: ['h0', 'h1'] })
  expect(r.state.deck.hand).toEqual([])
  expect(r.state.deck.discardPile.map((c) => c.wordId)).toEqual(['hide', 'rage', 'bite', 'guard'])
  expect(r.events).toContainEqual({ type: 'emptyDraw', missing: 2, hpLost: 4 })
})

test('버리기: 손패에 없는 카드나 빈 목록은 거부', () => {
  const s = withHand(start(), ['bite'])
  expect(act(s, { type: 'discard', instanceIds: [] }).events[0]).toMatchObject({ reason: 'unplayable' })
  expect(act(s, { type: 'discard', instanceIds: ['zz'] }).events[0]).toMatchObject({ reason: 'unplayable' })
})

test('비우기: 놓은 카드가 손패로 돌아온다', () => {
  const placed = act(withHand(start(), ['bite']), { type: 'place', instanceId: 'h0', at: V }).state
  const r = act(placed, { type: 'clear' })
  expect(r.state.deck.hand.map((c) => c.instanceId)).toEqual(['h0'])
  expect(hasVerb(r.state.board)).toBe(false)
  expect(r.events).toContainEqual({ type: 'cleared' })
})

test('대상 변경: 동사만 놓은 낭독이 바꾼 적을 때린다', () => {
  const s = act(start('test-pair'), { type: 'target', entityId: 'e1' })
  expect(s.events).toContainEqual({ type: 'targetChanged', entityId: 'e1' })
  const r = castVerb(s.state, 'bite')
  expect(hp(r.state, 'e1')).toBe(4)
  expect(hp(r.state, 'e0')).toBe(10)
  expect(act(start('test-pair'), { type: 'target', entityId: 'p' }).events[0]).toMatchObject({ reason: 'noTarget' })
})

test('지정한 적이 죽으면 다음 턴 대상은 살아 있는 적', () => {
  const s = act(start('test-pair'), { type: 'target', entityId: 'e1' }).state
  const r = castVerb({ ...s, entities: s.entities.map((e) => (e.id === 'e1' ? { ...e, hp: 3 } : e)) }, 'bite')
  expect(hp(r.state, 'e1')).toBe(0)
  expect(r.state.targetId).toBe('e0')
})

test('적이 여럿이면 각자 따로 행동한다', () => {
  const r = act(start('test-pair'), { type: 'endTurn' })
  const hits = r.events.filter((e) => e.type === 'damaged' && e.entityId === 'p')
  expect(hits.map((e) => (e.type === 'damaged' ? e.sourceId : ''))).toEqual(['e0', 'e1'])
  expect(hp(r.state, 'p')).toBe(54)
})

test('적 보호는 적 턴 시작에 사라진다', () => {
  const t1 = act(start('test-curl'), { type: 'endTurn' }).state
  expect(block(t1, 'e0')).toBe(8)
  const t2 = act(t1, { type: 'endTurn' }).state
  expect(block(t2, 'e0')).toBe(0)
})

test('적을 쓰러뜨리면 적 턴 없이 승리', () => {
  const s = start()
  const r = castVerb({ ...s, entities: s.entities.map((e) => (e.id === 'e0' ? { ...e, hp: 5 } : e)) }, 'bite')
  expect(r.state.phase).toBe('won')
  expect(r.events).not.toContainEqual({ type: 'enemyTurn' })
  expect(r.events).toContainEqual({ type: 'combatEnded', outcome: 'won' })
  expect(act(r.state, { type: 'endTurn' }).events[0]).toMatchObject({ reason: 'notPlayerTurn' })
})

test('내 HP가 0이 되면 패배', () => {
  const s = start()
  const r = act({ ...s, entities: s.entities.map((e) => (e.id === 'p' ? { ...e, hp: 5 } : e)) }, { type: 'endTurn' })
  expect(r.state.phase).toBe('lost')
})

test('기록: 낭독 수, 방어 낭독 수, 최대 한 방, 동사 없는 턴', () => {
  const afterBite = castVerb(start(), 'bite').state
  expect(afterBite.log).toMatchObject({ casts: 1, defensiveCasts: 0, bestBurst: 6 })
  const afterGuard = castVerb(afterBite, 'guard').state
  expect(afterGuard.log).toMatchObject({ casts: 2, defensiveCasts: 1, bestBurst: 6 })
  const noVerbs = act(withHand(start(), ['fiercely'], cards(['hungry'], 'd')), { type: 'endTurn' }).state
  expect(noVerbs.log.deadTurns).toBe(1)
})

test('최대 한 방은 적의 남은 HP에 잘리지 않은 문장의 위력이다', () => {
  const weak = (s: RallyState): RallyState => ({ ...s, entities: s.entities.map((e) => (e.side === 'enemy' ? { ...e, hp: 3 } : e)) })
  const killed = castVerb(weak(start()), 'bite').state
  expect(killed.phase).toBe('won')
  expect(killed.log.bestBurst).toBe(6)

  const echoBuild: BuildState = { ...EMPTY_BUILD, relics: ['echo'] }
  const echoed = castVerb(weak(startRally('test-dummy', DECK, 123, { build: echoBuild }).state), 'bite').state
  expect(echoed.log.bestBurst).toBe(12)
})

test.each(['test-pair', 'test-seal'])('카드 보존: 무작위 행동 200회 동안 내 카드 instanceId 집합이 변하지 않는다(연결어·봉인 포함): %s', (encounterId) => {
  const ids = (s: RallyState) =>
    [...s.deck.hand, ...s.deck.drawPile, ...s.deck.discardPile].map((c) => c.instanceId)
      .concat(playerWordsOnBoard(s.board).flatMap((w) => (w.instanceId ? [w.instanceId] : [])))
      .concat(s.connective?.instanceId ? [s.connective.instanceId] : [])
      .sort()
  let s = startRally(encounterId, [...DECK, 'and', 'so'], 123).state
  s = { ...s, entities: s.entities.map((e) => (e.side === 'ally' ? { ...e, hp: 9999, maxHp: 9999 } : { ...e, hp: 9999, maxHp: 9999 })) }
  const expected = ids(s)
  let rng: RngState = createRng(7)
  const roles = ['subject', 'object', 'verb'] as const
  let connected = 0
  let sealed = 0
  for (let i = 0; i < 200 && s.phase === 'player'; i++) {
    const [kind, r1] = nextInt(rng, 0, 7)
    const [pick, r2] = nextInt(r1, 0, Math.max(0, s.deck.hand.length - 1))
    const [roleIndex, r3] = nextInt(r2, 0, 2)
    const [mod, r4] = nextInt(r3, -1, 1)
    const [clause, r5] = nextInt(r4, 0, 1)
    rng = r5
    const card = s.deck.hand[pick]
    const actions: RallyAction[] = [
      card
        ? { type: 'place', instanceId: card.instanceId, at: { clause, role: roles[roleIndex] }, modifierIndex: mod < 0 ? undefined : mod }
        : { type: 'endTurn' },
      card ? { type: 'discard', instanceIds: [card.instanceId] } : { type: 'clear' },
      { type: 'clear' },
      { type: 'cast' },
      { type: 'endTurn' },
      { type: 'target', entityId: 'e1' },
      card ? { type: 'connect', instanceId: card.instanceId } : { type: 'clear' },
      { type: 'disconnect' },
    ]
    s = act(s, actions[kind]).state
    expect(ids(s)).toEqual(expected)
    if (s.connective) connected++
    if (s.board.clauses.some((c) => c.slots.some((slot) => slot.sealed))) sealed++
  }
  // 속성이 헛돌지 않도록: 연결어는 실제로 놓였고, 봉인 조우에서는 봉인이 실제로 걸렸다.
  expect(connected).toBeGreaterThan(0)
  if (encounterId === 'test-seal') expect(sealed).toBeGreaterThan(0)
  expect(getSlot(s.board, V)).toBeDefined()
})

describe('빌드와 전투 옵션', () => {
  const withBuild = (build: BuildState, options: Omit<RallyOptions, 'build'> = {}) =>
    startRally('test-dummy', DECK, 123, { ...options, build })

  test('동사 칸 +1이면 동사 수식어 칸이 3개', () => {
    const s = withBuild(applyStructure(EMPTY_BUILD, 'verbSlot')).state
    expect(getSlot(s.board, V).modifiers).toHaveLength(3)
  })

  test('손패 상한 7, 버리기 2회', () => {
    const s = withBuild(applyStructure(applyStructure(EMPTY_BUILD, 'handSize'), 'discard')).state
    expect(s.discardsLeft).toBe(2)
    const partial = withHand(s, ['bite', 'bite', 'bite', 'guard'], cards(['mend', 'slash', 'hungry', 'cracked', 'venomous'], 'd'))
    expect(act(partial, { type: 'endTurn' }).state.deck.hand).toHaveLength(7)
  })

  test('강화한 물어뜯는다로 낭독하면 피해 9', () => {
    const r = castVerb(withBuild({ ...EMPTY_BUILD, upgrades: { bite: 1 } }).state, 'bite')
    expect(hp(r.state, 'e0')).toBe(21)
  })

  test('옵션: HP 30/60으로 시작', () => {
    const p = withBuild(EMPTY_BUILD, { playerHp: 30, playerMaxHp: 60 }).state.entities.find((e) => e.id === 'p')
    expect(p).toMatchObject({ hp: 30, maxHp: 60 })
  })

  test('옵션: 적 HP ×1.3, 적 피해 ×1.2 (30 → 39, 7 → 8)', () => {
    const s = withBuild(EMPTY_BUILD, { enemyScale: { hp: 1.3, damage: 1.2 } }).state
    expect(hp(s, 'e0')).toBe(39)
    expect(hp(act(s, { type: 'endTurn' }).state, 'p')).toBe(52)
  })
})

test('버리기: 뽑을 더미가 비어도 방금 버린 카드를 다시 뽑지 않는다', () => {
  const s = withHand(start(), ['bite', 'guard'])
  const empty: RallyState = { ...s, deck: { ...s.deck, drawPile: [], discardPile: [] } }
  const r = act(empty, { type: 'discard', instanceIds: ['h0'] }).state
  expect(r.deck.hand.map((c) => c.wordId)).toEqual(['guard'])
  expect(r.deck.discardPile.map((c) => c.wordId)).toEqual(['bite'])
})

describe('v3 전투 흐름: 손패 채우기, 망각 비순환, 서고 바닥 대가, 떠올리기', () => {
  const filler = (n: number, prefix = 'd') => cards(Array.from({ length: n }, () => 'bite' as WordId), prefix)
  const withPiles = (s: RallyState, hand: WordId[], drawPile: CardInst[], discardPile: CardInst[] = []): RallyState => ({
    ...s,
    deck: { drawPile, discardPile, hand: cards(hand) },
  })
  const placeAndCast = (s: RallyState) => act(act(s, { type: 'place', instanceId: 'h0', at: V }).state, { type: 'cast' })
  const total = (s: RallyState) => s.deck.hand.length + s.deck.drawPile.length + s.deck.discardPile.length

  test('턴 시작에 손패를 손패 최대치(6)까지 채운다', () => {
    const r = placeAndCast(withPiles(start(), ['bite', 'guard', 'hide'], filler(10)))
    expect(r.state.deck.hand).toHaveLength(6)
    expect(r.events).toContainEqual({ type: 'drawn', count: 4 })
    expect(r.events.some((e) => e.type === 'burned')).toBe(false)
  })

  test('서고가 비어도 망각은 자동으로 서고로 돌아오지 않는다', () => {
    const r = placeAndCast(withPiles(start(), ['bite'], [], filler(5, 'x')))
    expect(r.state.deck.drawPile).toHaveLength(0)
    expect(r.state.deck.discardPile).toHaveLength(6)
  })

  test('서고가 비면 모자란 장수 × 2만큼 HP를 잃고, 보호가 있어도 줄어든다', () => {
    const base = withPiles(start(), ['bite'], [])
    const guarded = { ...base, entities: base.entities.map((e) => (e.id === 'p' ? addBlock(e, 10, 3) : e)) }
    const r = placeAndCast(guarded)
    expect(r.events).toContainEqual({ type: 'emptyDraw', missing: 6, hpLost: 12 })
    expect(hp(r.state, 'p')).toBe(60 - 12)
    expect(block(r.state, 'p')).toBe(3)
  })

  test('서고 바닥으로 HP가 0이 되면 전투에서 진다', () => {
    const base = withPiles(start(), ['bite'], [])
    const weak = { ...base, entities: base.entities.map((e) => (e.id === 'p' ? { ...e, hp: 10 } : e)) }
    const r = placeAndCast(weak)
    expect(r.state.phase).toBe('lost')
    expect(r.events).toContainEqual({ type: 'combatEnded', outcome: 'lost' })
  })

  test('서고가 빈 상태에서 버리면 버린 장수만큼 대가를 치르고, 버린 카드는 망각으로 간다', () => {
    const r = act(withPiles(start(), ['bite', 'guard'], []), { type: 'discard', instanceIds: ['h1'] })
    expect(r.events).toContainEqual({ type: 'emptyDraw', missing: 1, hpLost: 2 })
    expect(r.state.deck.discardPile.map((c) => c.instanceId)).toEqual(['h1'])
    expect(r.state.deck.hand.map((c) => c.instanceId)).toEqual(['h0'])
  })

  test('떠올린다는 망각에서 4장을 서고로 옮긴다(망각이 2장이면 2장)', () => {
    const s = withPiles(start(), ['recall'], filler(10), filler(2, 'x'))
    const r = placeAndCast(s)
    expect(r.events).toContainEqual({ type: 'recalled', count: 2 })
    expect(total(r.state)).toBe(total(s))
    expect(r.state.deck.discardPile.map((c) => c.instanceId)).toEqual(['h0'])
    const big = placeAndCast(withPiles(start(), ['recall'], filler(10), filler(6, 'x')))
    expect(big.events).toContainEqual({ type: 'recalled', count: 4 })
    expect(big.state.deck.discardPile).toHaveLength(3)
  })

  test('적의 holds 1 보호는 적 차례 시작을 한 번 넘긴다', () => {
    const base = withPiles(start(), [], filler(20))
    const s = { ...base, entities: base.entities.map((e) => (e.id === 'e0' ? addBlock(e, 8, 1) : e)) }
    const once = act(s, { type: 'endTurn' }).state
    expect(block(once, 'e0')).toBe(8)
    const twice = act(once, { type: 'endTurn' }).state
    expect(block(twice, 'e0')).toBe(0)
  })
})
