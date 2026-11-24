import type { WordId } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import { type CardInst, type RallyAction, type RallyState, reduceRally, runSentence, startRally } from './combat'
import { PLAYER_ID } from '@/game/content/characters'
import './testFixtures'

const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
const DECK: WordId[] = ['guard', 'guard', 'hide', 'mend', 'scare', 'rage']

type Placement = [WordId, { clause: number; role: 'subject' | 'object' | 'verb' } | 'connect', string?]

/** 손패를 정해 놓고 순서대로 놓는다. 대상 지정이 필요하면 세 번째 값에 적 id. */
function setup(encounterId: string, placements: Placement[], edit: (s: RallyState) => RallyState = (s) => s): RallyState {
  const base = edit(startRally(encounterId, DECK, 1).state)
  const hand = placements.map(([wordId], i): CardInst => ({ instanceId: `h${i}`, wordId }))
  let s: RallyState = { ...base, deck: { drawPile: [], discardPile: [], hand } }
  placements.forEach(([, at, targetEntityId], i) => {
    const action: RallyAction = at === 'connect'
      ? { type: 'connect', instanceId: `h${i}` }
      : { type: 'place', instanceId: `h${i}`, at, targetEntityId }
    s = reduceRally(s, action).state
  })
  return s
}
const cast = (s: RallyState) => reduceRally(s, { type: 'cast' })
const runSentenceLingering = (s: RallyState) => runSentence(s).lingering
/** 적 차례에 각 적이 내게 준 피해(보호에 막힌 양 포함). */
const enemyHits = (events: readonly CombatEvent[]) => {
  const turn = events.findIndex((e) => e.type === 'enemyTurn')
  return events.slice(turn).flatMap((e) => (e.type === 'damaged' && e.entityId === PLAYER_ID ? [[e.sourceId, e.amount + e.blocked] as const] : []))
}
/** 낭독하고(이어서 적 차례까지 진행) 결과와 적 차례에 내가 받은 피해를 돌려준다. */
const castAndEnemyHits = (s: RallyState) => {
  const r = cast(s)
  return { r, hits: enemyHits(r.events) }
}

test('눈먼을 적에게 놓고 낭독하면 그 적 차례 피해가 ×0.5', () => {
  expect(castAndEnemyHits(setup('test-dummy', [['bite', V], ['blind', O]])).hits).toEqual([['e0', 3]])
})

test('단단한을 나에게 놓으면 적 차례에 받는 피해 −3', () => {
  expect(castAndEnemyHits(setup('test-dummy', [['bite', V], ['sturdy', S]])).hits).toEqual([['e0', 4]])
})

test('금이 간을 나에게 놓으면 적 차례에 받는 피해 ×1.5', () => {
  expect(castAndEnemyHits(setup('test-dummy', [['bite', V], ['cracked', S]])).hits).toEqual([['e0', 10]])
})

test('독을 뿜는을 적에게 놓으면 그 적의 공격에 독 2가 붙는다', () => {
  const { r } = castAndEnemyHits(setup('test-dummy', [['bite', V], ['venomous', O]]))
  const turn = r.events.findIndex((e) => e.type === 'enemyTurn')
  expect(r.events.slice(turn)).toContainEqual({ type: 'statusApplied', entityId: PLAYER_ID, status: 'poison', amount: 2 })
})

test('거대한·굶주린은 남지 않는다', () => {
  const { r, hits } = castAndEnemyHits(setup('test-dummy', [['bite', V], ['giant', O], ['hungry', O]]))
  expect(hits).toEqual([['e0', 7]])
  expect(r.state.lingering).toEqual({})
})

test('적 차례가 끝나면 남은 상태가 사라진다', () => {
  expect(cast(setup('test-dummy', [['bite', V], ['blind', O]])).state.lingering).toEqual({})
})

test('무효가 된 절(주어 빙결)의 형용사는 남지 않는다', () => {
  const frozen = (s: RallyState): RallyState => ({
    ...s, entities: s.entities.map((e) => (e.id === PLAYER_ID ? { ...e, statuses: { ...e.statuses, freeze: 1 } } : e)),
  })
  expect(castAndEnemyHits(setup('test-dummy', [['bite', V], ['blind', O]], frozen)).hits).toEqual([['e0', 7]])
})

test('모두를 꾸미면 전원에게 남는다', () => {
  expect(castAndEnemyHits(setup('test-pair', [['bite', V], ['everyone', O], ['blind', O]])).hits).toEqual([['e0', 1], ['e1', 1]])
})

test('한 적에게만 붙이면 다른 적은 그대로다', () => {
  expect(castAndEnemyHits(setup('test-pair', [['bite', V], ['blind', O]])).hits).toEqual([['e0', 1], ['e1', 3]])
})

test('그러면서로 빌려 온 형용사는 둘째 절의 대상에게도 남는다(같은 카드는 한 개체에 한 번)', () => {
  const s = setup('test-pair', [['bite', V], ['blind', O], ['while', 'connect'], ['bite', { clause: 1, role: 'verb' }], ['mark', { clause: 1, role: 'object' }, 'e1']])
  expect(castAndEnemyHits(s).hits).toEqual([['e0', 1], ['e1', 1]])
  const same = setup('test-dummy', [['bite', V], ['blind', O], ['while', 'connect'], ['bite', { clause: 1, role: 'verb' }]])
  expect(castAndEnemyHits(same).hits).toEqual([['e0', 3]])
})

test('눈먼 두 장은 곱해진다(×0.25)', () => {
  expect(castAndEnemyHits(setup('test-dummy', [['bite', V], ['blind', O], ['blind', O]])).hits).toEqual([['e0', 1]])
})

test('상태가 남은 적이 쓰러져도 오류 없이 무시된다', () => {
  const weak = (s: RallyState): RallyState => ({ ...s, entities: s.entities.map((e) => (e.id === 'e0' ? { ...e, hp: 1 } : e)) })
  const { r, hits } = castAndEnemyHits(setup('test-pair', [['bite', V], ['blind', O]], weak))
  expect(hits).toEqual([['e1', 3]])
  expect(r.state.lingering).toEqual({})
})

test('이번 절에서 불러낸 토큰도 꾸민 상태를 받는다(단단한 허수아비가 문다)', () => {
  const r = cast(setup('test-dummy', [['bite', V], ['scarecrow', S], ['sturdy', S]]))
  const scarecrow = r.state.entities.find((e) => e.defId === 'scarecrow')
  expect(scarecrow).toBeDefined()
  const hold = setup('test-dummy', [['bite', V], ['scarecrow', S], ['sturdy', S]])
  expect(Object.values(runSentenceLingering(hold))).toEqual([['sturdy']])
})

test('허수아비 화자: 빈 주어의 형용사는 문자 그대로 허수아비에게 남는다', () => {
  const s = setup('test-dummy', [['bite', V], ['sturdy', S]], (st) => ({ ...st, build: { ...st.build, relics: ['scarecrowSpeaker'] } }))
  const lingering = runSentenceLingering(s)
  const run = runSentence(s)
  const scarecrowId = run.state.entities.find((e) => e.defId === 'scarecrow')?.id
  expect(scarecrowId).toBeDefined()
  expect(lingering).toEqual({ [scarecrowId ?? '']: ['sturdy'] })
})
