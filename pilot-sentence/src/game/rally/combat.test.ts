import { createRng, nextInt, type RngState } from '@/kit/core/rng'
import { BALANCE } from '@/game/content/balance'
import type { WordId } from '@/game/content/words'
import { getSlot, playerWordsOnBoard } from '@/game/sentence/board'
import { applyStructure, type BuildState, EMPTY_BUILD } from '@/game/build/build'
import { type CardInst, type RallyAction, type RallyOptions, type RallyState, reduceRally, startRally } from './combat'
import { hasVerb } from './sentence'
import './testFixtures'

const DECK: WordId[] = ['bite', 'bite', 'bite', 'slash', 'guard', 'guard', 'hide', 'rage', 'scare', 'mend', 'fiercely', 'fiercely', 'hungry', 'cracked', 'venomous']
const V = { clause: 0, role: 'verb' } as const
const start = (encounterId = 'test-dummy') => startRally(encounterId, DECK, 123, BALANCE).state
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a, BALANCE)
const hp = (s: RallyState, id: string) => s.entities.find((e) => e.id === id)?.hp
const block = (s: RallyState, id: string) => s.entities.find((e) => e.id === id)?.statuses.block
const cards = (words: WordId[], prefix = 'h'): CardInst[] => words.map((wordId, i) => ({ instanceId: `${prefix}${i}`, wordId }))
const withHand = (s: RallyState, words: WordId[], drawPile: CardInst[] = []): RallyState => ({
  ...s,
  deck: { drawPile, discardPile: [], hand: cards(words) },
})
const castVerb = (s: RallyState, verb: WordId) => act(act(withHand(s, [verb]), { type: 'place', instanceId: 'h0', at: V }).state, { type: 'cast' })

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
  const s = withHand(start(), ['bite'], cards(['guard', 'guard', 'hide', 'rage', 'scare'], 'd'))
  const r = act(act(s, { type: 'place', instanceId: 'h0', at: V }).state, { type: 'cast' })
  expect(hp(r.state, 'e0')).toBe(24)
  expect(hp(r.state, 'p')).toBe(53)
  expect(r.state.turn).toBe(2)
  expect(r.state.deck.discardPile.map((c) => c.instanceId)).toContain('h0')
  expect(hasVerb(r.state.board)).toBe(false)
  expect(r.events).toContainEqual({ type: 'enemyTurn' })
})

test('막는다 낭독 → 반격 7 중 6을 막고, 다음 내 턴 시작에 보호 0', () => {
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

test('손패는 이월되고 5장을 뽑되 8장을 넘으면 소각', () => {
  const s = withHand(start(), ['bite', 'bite', 'bite', 'guard', 'guard', 'hide', 'rage'], cards(['scare', 'mend', 'slash', 'hungry', 'cracked'], 'd'))
  const r = act(s, { type: 'endTurn' })
  expect(r.state.deck.hand).toHaveLength(8)
  expect(r.events.filter((e) => e.type === 'burned')).toHaveLength(4)
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

test('버리기: 덱이 비어 있으면 버림 더미를 섞어 뽑고, 그래도 없으면 덜 뽑는다', () => {
  const r = act(withHand(start(), ['bite', 'guard']), { type: 'discard', instanceIds: ['h0', 'h1'] })
  expect(r.state.deck.hand).toHaveLength(2)
  const lonely = act(withHand(start(), ['bite']), { type: 'discard', instanceIds: ['h0'] })
  expect(lonely.state.deck.hand.map((c) => c.instanceId)).toEqual(['h0'])
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
  const echoed = castVerb(weak(startRally('test-dummy', DECK, 123, BALANCE, { build: echoBuild }).state), 'bite').state
  expect(echoed.log.bestBurst).toBe(12)
})

test('카드 보존: 무작위 행동 200회 동안 내 카드 instanceId 집합이 변하지 않는다', () => {
  const ids = (s: RallyState) =>
    [...s.deck.hand, ...s.deck.drawPile, ...s.deck.discardPile].map((c) => c.instanceId)
      .concat(playerWordsOnBoard(s.board).flatMap((w) => (w.instanceId ? [w.instanceId] : [])))
      .sort()
  let s = start('test-pair')
  s = { ...s, entities: s.entities.map((e) => (e.side === 'ally' ? { ...e, hp: 9999, maxHp: 9999 } : { ...e, hp: 9999, maxHp: 9999 })) }
  const expected = ids(s)
  let rng: RngState = createRng(7)
  const roles = ['subject', 'object', 'verb'] as const
  for (let i = 0; i < 200 && s.phase === 'player'; i++) {
    const [kind, r1] = nextInt(rng, 0, 5)
    const [pick, r2] = nextInt(r1, 0, Math.max(0, s.deck.hand.length - 1))
    const [roleIndex, r3] = nextInt(r2, 0, 2)
    const [mod, r4] = nextInt(r3, -1, 1)
    rng = r4
    const card = s.deck.hand[pick]
    const actions: RallyAction[] = [
      card
        ? { type: 'place', instanceId: card.instanceId, at: { clause: 0, role: roles[roleIndex] }, modifierIndex: mod < 0 ? undefined : mod }
        : { type: 'endTurn' },
      card ? { type: 'discard', instanceIds: [card.instanceId] } : { type: 'clear' },
      { type: 'clear' },
      { type: 'cast' },
      { type: 'endTurn' },
      { type: 'target', entityId: 'e1' },
    ]
    s = act(s, actions[kind]).state
    expect(ids(s)).toEqual(expected)
  }
  expect(getSlot(s.board, V)).toBeDefined()
})

describe('빌드와 전투 옵션', () => {
  const withBuild = (build: BuildState, options: Omit<RallyOptions, 'build'> = {}) =>
    startRally('test-dummy', DECK, 123, BALANCE, { ...options, build })

  test('동사 칸 +1이면 동사 수식어 칸이 3개', () => {
    const s = withBuild(applyStructure(EMPTY_BUILD, 'verbSlot')).state
    expect(getSlot(s.board, V).modifiers).toHaveLength(3)
  })

  test('손패 상한 9, 버리기 2회', () => {
    const s = withBuild(applyStructure(applyStructure(EMPTY_BUILD, 'handSize'), 'discard')).state
    expect(s.discardsLeft).toBe(2)
    const full = withHand(s, ['bite', 'bite', 'bite', 'guard', 'guard', 'hide', 'rage', 'scare'], cards(['mend', 'slash', 'hungry', 'cracked', 'venomous'], 'd'))
    expect(act(full, { type: 'endTurn' }).state.deck.hand).toHaveLength(9)
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
