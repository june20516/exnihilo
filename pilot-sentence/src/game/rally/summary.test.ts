import { addStatus } from '@/kit/core/entity'
import { RALLY_RULES } from '@/game/content/balance'
import { PLAYER_ID } from '@/game/content/characters'
import type { WordId } from '@/game/content/words'
import { EMPTY_BUILD } from '@/game/build/build'
import { type CardInst, type RallyAction, type RallyState, reduceRally, startRally } from './combat'
import { previewEvents } from './preview'
import { amplifiers, intentActions, pileContents, previewSummary } from './summary'
import './testFixtures'

const V = { clause: 0, role: 'verb' } as const
const FILLER: CardInst[] = Array.from({ length: 12 }, (_, i) => ({ instanceId: `f${i}`, wordId: 'bite' }))
const act = (s: RallyState, a: RallyAction) => reduceRally(s, a).state
const withHand = (words: WordId[], encounterId = 'test-dummy'): RallyState => ({
  ...startRally(encounterId, ['bite'], 1).state,
  deck: { drawPile: FILLER, discardPile: [], hand: words.map((wordId, i): CardInst => ({ instanceId: `h${i}`, wordId })) },
})
const placed = (words: WordId[], encounterId?: string) => act(withHand(words, encounterId), { type: 'place', instanceId: 'h0', at: V })

test('previewSummary: 물어뜯는다 → 적 30→24, damage 6 칩', () => {
  const { mine } = previewSummary(placed(['bite']))
  expect(mine).toEqual([expect.objectContaining({ id: 'e0', hpBefore: 30, hpAfter: 24, died: false, chips: [{ kind: 'damage', amount: 6 }] })])
})

test('previewSummary: 막는다 → 내 block 6 holds 1 칩, 적 차례 damage 7 / blocked 6', () => {
  const { mine, enemy } = previewSummary(placed(['guard']))
  expect(mine).toEqual([expect.objectContaining({ id: PLAYER_ID, chips: [{ kind: 'block', amount: 6, holds: 1 }] })])
  expect(enemy.find((e) => e.id === PLAYER_ID)?.chips).toEqual([{ kind: 'damage', amount: 1 }, { kind: 'blocked', amount: 6 }])
})

test('previewSummary: 처치면 died true', () => {
  const s = placed(['bite'])
  const weak = { ...s, entities: s.entities.map((e) => (e.id === 'e0' ? { ...e, hp: 3 } : e)) }
  expect(previewSummary(weak).mine[0]).toMatchObject({ id: 'e0', hpAfter: 0, died: true })
})

test('previewSummary: 동사가 없으면 mine은 비어 있다', () => {
  expect(previewSummary(withHand(['bite'])).mine).toEqual([])
})

test('intentActions: test-dummy는 attack 7, test-curl 첫 턴은 block 8 holds 0, test-seal은 seal subject', () => {
  expect(intentActions(withHand(['bite']))).toEqual({ e0: [{ kind: 'attack', amount: 7, target: '탐험가' }] })
  expect(intentActions(withHand(['bite'], 'test-curl'))).toEqual({ e0: [{ kind: 'block', amount: 8, holds: 0 }] })
  expect(intentActions(withHand(['bite'], 'test-seal'))).toEqual({ e0: [{ kind: 'seal', role: 'subject', fizzled: false }] })
})

test('intentActions 수치는 미리보기의 적 차례와 같다: 막는다를 놓아도 공격 7(막은 양은 미리보기 칩이 보인다)', () => {
  const s = placed(['guard'])
  const hit = previewEvents(s).enemy.find((e) => e.type === 'damaged')
  expect(hit?.type === 'damaged' ? hit.amount + hit.blocked : -1).toBe(7)
  expect(intentActions(s).e0).toEqual([{ kind: 'attack', amount: 7, target: '탐험가' }])
})

test('intentActions: 얼어 있는 적은 fizzled', () => {
  const s = withHand(['bite'])
  const frozen = { ...s, entities: s.entities.map((e) => (e.id === 'e0' ? addStatus(e, 'freeze', 1) : e)) }
  expect(intentActions(frozen).e0).toEqual([{ kind: 'fizzled' }])
})

test('amplifiers: 유물 2개와 강화 1개, 바뀌지 않은 구조는 넣지 않는다', () => {
  const s = withHand(['bite'])
  const built = { ...s, build: { ...EMPTY_BUILD, relics: ['echo', 'stress'] as const, upgrades: { slash: 1 }, handMax: EMPTY_BUILD.handMax + 1 } }
  const list = amplifiers({ ...built, build: { ...built.build, relics: [...built.build.relics] } })
  expect(list.map((a) => [a.kind, a.name])).toEqual([['relic', '메아리'], ['relic', '강세'], ['structure', '손패 최대치'], ['upgrade', '벤다']])
  expect(list.find((a) => a.kind === 'upgrade')?.text).toBe('1단계')
})

test('amplifiers: 내 상태(힘)도 넣는다', () => {
  const s = withHand(['bite'])
  const strong = { ...s, entities: s.entities.map((e) => (e.id === PLAYER_ID ? addStatus(e, 'strength', 2) : e)) }
  expect(amplifiers(strong)).toEqual([{ kind: 'status', name: '힘', text: '+2' }])
})

test('pileContents: 서고는 단어별 장수, 망각은 순서, emptyDrawHpLoss는 규칙 값', () => {
  const s = withHand(['bite'])
  const piles = { ...s, deck: { ...s.deck, drawPile: [{ instanceId: 'a', wordId: 'bite' }, { instanceId: 'b', wordId: 'guard' }, { instanceId: 'c', wordId: 'bite' }], discardPile: [{ instanceId: 'd', wordId: 'slash' }, { instanceId: 'e', wordId: 'bite' }] } }
  expect(pileContents(piles)).toEqual({
    draw: [{ wordId: 'bite', count: 2 }, { wordId: 'guard', count: 1 }],
    discard: ['slash', 'bite'],
    emptyDrawHpLoss: RALLY_RULES.emptyDrawHpLoss,
  })
})

describe('적이 여럿일 때 예고', () => {
  test('내 낭독이 앞 적을 처치해도 뒤 적의 예고는 그 적에게 붙는다', () => {
    const s = placed(['bite'], 'test-pair')
    const weakFirst = { ...s, entities: s.entities.map((e) => (e.id === 'e0' ? { ...e, hp: 2 } : e)) }
    const actions = intentActions(weakFirst)
    expect(actions.e1).toEqual([{ kind: 'attack', amount: 3, target: '탐험가' }])
    expect(actions.e0 ?? []).toEqual([])
  })
  test('둘 다 살아 있으면 각자 자기 공격', () => {
    expect(intentActions(placed(['guard'], 'test-pair'))).toEqual({
      e0: [{ kind: 'attack', amount: 3, target: '탐험가' }],
      e1: [{ kind: 'attack', amount: 3, target: '탐험가' }],
    })
  })
})

test('previewSummary·intentActions는 미리 계산한 미리보기를 받아도 같은 값을 낸다', () => {
  const s = placed(['guard'])
  const preview = previewEvents(s)
  expect(previewSummary(s, preview)).toEqual(previewSummary(s))
  expect(intentActions(s, preview)).toEqual(intentActions(s))
})
