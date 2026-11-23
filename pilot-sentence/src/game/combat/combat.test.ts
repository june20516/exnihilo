import { BALANCE } from '@/game/content/balance'
import { ENCOUNTERS } from '@/game/content/encounters'
import { PRESETS, type RuleConfig } from '@/game/content/rules'
import type { WordId } from '@/game/content/words'
import { getSlot } from '@/game/sentence/board'
import {
  type CardInst, type CombatAction, type CombatState, currentIntent, reduceCombat, startCombat, turnsUntilEnemyCast,
  upcomingIntents,
} from './combat'
import { previewExecution } from './preview'

/**
 * 엔진 규칙 테스트용 고정 조우(실제 조우는 밸런스 튜닝으로 바뀐다).
 * 루프: 주어 되돌림 → 목적어 되돌림 → 격렬하게 → 오염 → 격앙, 낭독 주기 2.
 */
const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
ENCOUNTERS['test-spider'] = {
  id: 'test-spider',
  name: '시험 거미',
  enemies: [{ defId: 'spider', name: '거미', hp: 30, row: 'front', portrait: '' }],
  initialSentence: [
    {
      frameId: 'transitive',
      slots: [
        { role: 'subject', head: 'spider', modifiers: ['venomous'] },
        { role: 'object', head: 'you' },
        { role: 'verb', head: 'bite' },
      ],
    },
  ],
  interventionLoop: [
    { kind: 'revert', at: S },
    { kind: 'revert', at: O },
    { kind: 'attach', at: V, word: 'fiercely' },
    { kind: 'pollute', word: 'web', count: 1 },
    { kind: 'enrage' },
  ],
  castEvery: 2,
}
const DECK: WordId[] = ['you', 'you', 'mark', 'scarecrow', 'bite', 'guard', 'mend', 'rage', 'blind', 'fiercely', 'scare', 'hide']

const start = (rules: RuleConfig = PRESETS.A) => startCombat('test-spider', DECK, 123, BALANCE, rules).state
const act = (s: CombatState, a: CombatAction) => reduceCombat(s, a, BALANCE)
const end = (s: CombatState) => act(s, { type: 'endTurn' }).state
const hp = (s: CombatState, id: string) => s.entities.find((e) => e.id === id)?.hp
const withHand = (s: CombatState, words: WordId[], extra: Partial<CombatState> = {}): CombatState => ({
  ...s,
  deck: { drawPile: [], discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
  ...extra,
})
const allCards = (s: CombatState) => [...s.deck.hand, ...s.deck.drawPile, ...s.deck.discardPile]

describe('공통', () => {
  test('행동력이 부족하면 거부되고 상태 불변', () => {
    const s = withHand(start(), ['you'], { resource: 0 })
    const r = act(s, { type: 'place', instanceId: 'h0', at: S })
    expect(r.state).toBe(s)
    expect(r.events).toEqual([{ type: 'rejected', reason: 'notEnoughAp', at: S }])
  })

  test('뒤바꾸기는 턴당 1회 무료로 주어와 목적어를 맞바꾼다', () => {
    const s = start()
    const r = act(s, { type: 'swap', clause: 0 })
    expect(getSlot(r.state.board, S).head.wordId).toBe('you')
    expect(getSlot(r.state.board, O).head.wordId).toBe('spider')
    // 명사구째 옮긴다: [독을 뿜는]은 거미를 따라 목적어로 간다
    expect(getSlot(r.state.board, O).modifiers[0]?.wordId).toBe('venomous')
    expect(r.state.resource).toBe(s.resource)
    expect(act(r.state, { type: 'swap', clause: 0 }).events[0]).toMatchObject({ type: 'rejected', reason: 'noSwapLeft' })
  })

  test('자동사 문장에서는 뒤바꾸기가 거부된다', () => {
    const s = act(withHand(start(), ['rage']), { type: 'place', instanceId: 'h0', at: V }).state
    expect(act(s, { type: 'swap', clause: 0 }).events[0]).toMatchObject({ type: 'rejected', reason: 'slotInactive' })
  })

  test('5번째 개입(격앙) 이후 예고 2개, 개입 2번', () => {
    let s: CombatState = { ...start(PRESETS.B), entities: start(PRESETS.B).entities.map((e) => (e.id === 'p' ? { ...e, hp: 999, maxHp: 999 } : e)) }
    for (let i = 0; i < 5; i++) s = end(s)
    expect(s.enraged).toBe(true)
    expect(upcomingIntents(s)).toHaveLength(2)
    expect(act(s, { type: 'endTurn' }).events.filter((e) => e.type === 'intervention')).toHaveLength(2)
  })

  test('모두가 무너진다로 나와 적이 함께 쓰러지면 패배', () => {
    const base = withHand(start(PRESETS.A), ['rage'])
    const s0: CombatState = {
      ...base,
      entities: base.entities.map((e) => ({ ...e, hp: 5 })),
      board: { clauses: base.board.clauses.map((c) => ({ ...c, slots: c.slots.map((slot) => slot.role === 'subject'
        ? { ...slot, head: { wordId: 'everyone', owner: 'player', inkLeft: 2, instanceId: 'x', targetEntityId: null } }
        : slot.role === 'verb' ? { ...slot, head: { wordId: 'collapse', owner: 'player', inkLeft: 2, instanceId: 'y', targetEntityId: null } } : slot) })) },
      loopIndex: 2,
    }
    expect(end(s0).phase).toBe('lost')
  })
})

describe('프리셋 A (StS형)', () => {
  test('시작: 손패 4, 행동력 3, 첫 예고는 주어 되돌림', () => {
    const s = start()
    expect(s.deck.hand).toHaveLength(4)
    expect(s.resource).toBe(3)
    expect(currentIntent(s)).toEqual({ kind: 'revert', at: S })
  })

  test('턴 종료: 손패는 버려지고, 예고대로 주어가 되돌려져 내가 맞는다', () => {
    const s1 = act(withHand(start(), ['you']), { type: 'place', instanceId: 'h0', at: S }).state
    const s2 = end(s1)
    expect(hp(s2, 'p')).toBe(52)
    expect(s2.deck.hand).toHaveLength(1)
  })

  test('잉크 건조: 동사 수식어는 두 번 실행 후 마른다', () => {
    let s = act(withHand(start(), ['fiercely']), { type: 'place', instanceId: 'h0', at: V, modifierIndex: 0 }).state
    s = end(s)
    const r = act(s, { type: 'endTurn' })
    expect(r.events).toContainEqual({ type: 'dried', at: V, wordId: 'fiercely', modifierIndex: 0 })
  })

  test('추가 드로우와 낭독은 쓸 수 없다', () => {
    expect(act(start(), { type: 'drawPaid' }).events[0]).toMatchObject({ reason: 'noPaidDraw' })
    expect(act(start(), { type: 'cast' }).events[0]).toMatchObject({ reason: 'cannotCast' })
  })
})

describe('프리셋 B (하스스톤형)', () => {
  test('마나는 1에서 시작해 매 턴 +1, 손패는 유지되고 1장씩 드로우', () => {
    const s = start(PRESETS.B)
    expect(s.resource).toBe(1)
    const s2 = end(s)
    expect(s2.resource).toBe(2)
    expect(s2.deck.hand).toHaveLength(5)
  })

  test('놓은 단어는 마르지 않는다', () => {
    let s = act(withHand(start(PRESETS.B), ['fiercely']), { type: 'place', instanceId: 'h0', at: V, modifierIndex: 0 }).state
    for (let i = 0; i < 3; i++) s = end(s)
    expect(getSlot(s.board, V).modifiers[0]?.wordId).toBe('fiercely')
  })

  test('손패가 가득 차면 새로 뽑은 카드는 소각된다', () => {
    const full = withHand(start(PRESETS.B), ['you', 'you', 'mark', 'bite', 'guard', 'mend', 'rage'])
    const s = { ...full, deck: { ...full.deck, drawPile: [{ instanceId: 'z', wordId: 'hide' }] } }
    const r = act(s, { type: 'endTurn' })
    expect(r.state.deck.hand).toHaveLength(7)
    expect(r.events).toContainEqual({ type: 'burned', wordId: 'hide' })
    expect(r.state.deck.discardPile.map((c) => c.instanceId)).toContain('z')
  })
})

describe('프리셋 C (잉크·낭독형)', () => {
  test('잉크는 3에서 시작해 매 턴 +3, 최대 8', () => {
    const s = start(PRESETS.C)
    expect(s.resource).toBe(3)
    expect(end(s).resource).toBe(6)
    expect(end(end(s)).resource).toBe(8)
  })

  test('추가 드로우는 잉크 1, 덱이 모두 비면 거부(잉크 불변)', () => {
    const s = start(PRESETS.C)
    const r = act(s, { type: 'drawPaid' })
    expect(r.state.deck.hand).toHaveLength(5)
    expect(r.state.resource).toBe(2)
    const empty = withHand(s, ['you'])
    const r2 = act(empty, { type: 'drawPaid' })
    expect(r2.events[0]).toMatchObject({ reason: 'deckEmpty' })
    expect(r2.state).toBe(empty)
  })

  test('턴 종료만으로는 실행되지 않고, 적은 2턴마다 낭독한다', () => {
    const r1 = act(start(PRESETS.C), { type: 'endTurn' })
    expect(r1.events.some((e) => e.type === 'clauseExecuted')).toBe(false)
    expect(turnsUntilEnemyCast(r1.state)).toBe(1)
    const r2 = act(r1.state, { type: 'endTurn' })
    expect(r2.events).toContainEqual({ type: 'cast', by: 'enemy' })
    expect(r2.events.some((e) => e.type === 'clauseExecuted')).toBe(true)
  })

  test('낭독: 지금 문장을 실행하고 내 단어를 소비(버림 더미, 원문 복원)한 뒤 턴을 끝낸다', () => {
    let s = withHand(start(PRESETS.C), ['you', 'mark'])
    s = act(s, { type: 'place', instanceId: 'h0', at: S }).state
    s = act(s, { type: 'place', instanceId: 'h1', at: O }).state
    const r = act(s, { type: 'cast' })
    expect(r.events[0]).toEqual({ type: 'cast', by: 'player' })
    expect(hp(r.state, 'e0')).toBe(30 - 6 - 2)
    expect(getSlot(r.state.board, S).head.wordId).toBe('spider')
    expect(allCards(r.state).map((c) => c.instanceId)).toEqual(expect.arrayContaining(['h0', 'h1']))
    expect(r.state.turn).toBe(2)
  })
})

describe('미리보기', () => {
  test('자동 실행: 예고된 개입 후의 결과를 보여 준다', () => {
    const s = act(withHand(start(), ['you']), { type: 'place', instanceId: 'h0', at: S }).state
    const lines = previewExecution(s).map((l) => l.text)
    expect(lines).toContain('거미 → 탐험가: 피해 6')
    expect(lines).toContain('탐험가: 독 +2')
  })

  test('낭독 모드: 지금 낭독하면의 결과(개입 없이)', () => {
    const s = act(withHand(start(PRESETS.C), ['you']), { type: 'place', instanceId: 'h0', at: S }).state
    const lines = previewExecution(s).map((l) => l.text)
    expect(lines).toContain('탐험가 → 탐험가: 피해 6')
  })
})
