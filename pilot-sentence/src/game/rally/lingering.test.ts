import { BALANCE } from '@/game/content/balance'
import type { WordId } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import { type CardInst, PLAYER_ID, type RallyAction, type RallyState, reduceRally, startRally } from './combat'
import './testFixtures'

const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
const DECK: WordId[] = ['guard', 'guard', 'hide', 'mend', 'scare', 'rage']

type Placement = [WordId, { clause: number; role: "subject" | "object" | "verb" } | "connect", string?]

/** 손패를 정해 놓고 순서대로 놓는다. 대상 지정이 필요하면 세 번째 값에 적 id. */
function setup(encounterId: string, placements: Placement[], edit: (s: RallyState) => RallyState = (s) => s): RallyState {
  const base = edit(startRally(encounterId, DECK, 1, BALANCE).state)
  const hand = placements.map(([wordId], i): CardInst => ({ instanceId: `h${i}`, wordId }))
  let s: RallyState = { ...base, deck: { drawPile: [], discardPile: [], hand } }
  placements.forEach(([, at, targetEntityId], i) => {
    const action: RallyAction = at === 'connect'
      ? { type: 'connect', instanceId: `h${i}` }
      : { type: 'place', instanceId: `h${i}`, at, targetEntityId }
    s = reduceRally(s, action, BALANCE).state
  })
  return s
}
const cast = (s: RallyState) => reduceRally(s, { type: 'cast' }, BALANCE)
/** 적 차례에 각 적이 내게 준 피해(보호에 막힌 양 포함). */
const enemyHits = (events: readonly CombatEvent[]) => {
  const turn = events.findIndex((e) => e.type === 'enemyTurn')
  return events.slice(turn).flatMap((e) => (e.type === 'damaged' && e.entityId === PLAYER_ID ? [[e.sourceId, e.amount + e.blocked] as const] : []))
}
/** 적 차례 직전 상태를 보려고 낭독만 실행: 낭독 결과의 lingering은 적 차례 끝에 비워지므로, 미리 들여다보는 도우미. */
const lingeringAfterCast = (s: RallyState) => {
  const r = cast(s)
  return { r, hits: enemyHits(r.events) }
}

test('눈먼을 적에게 놓고 낭독하면 그 적 차례 피해가 ×0.5', () => {
  expect(lingeringAfterCast(setup('test-dummy', [['bite', V], ['blind', O]])).hits).toEqual([['e0', 3]])
})

test('단단한을 나에게 놓으면 적 차례에 받는 피해 −3', () => {
  expect(lingeringAfterCast(setup('test-dummy', [['bite', V], ['sturdy', S]])).hits).toEqual([['e0', 4]])
})

test('금이 간을 나에게 놓으면 적 차례에 받는 피해 ×1.5', () => {
  expect(lingeringAfterCast(setup('test-dummy', [['bite', V], ['cracked', S]])).hits).toEqual([['e0', 10]])
})

test('독을 뿜는을 적에게 놓으면 그 적의 공격에 독 2가 붙는다', () => {
  const { r } = lingeringAfterCast(setup('test-dummy', [['bite', V], ['venomous', O]]))
  const turn = r.events.findIndex((e) => e.type === 'enemyTurn')
  expect(r.events.slice(turn)).toContainEqual({ type: 'statusApplied', entityId: PLAYER_ID, status: 'poison', amount: 2 })
})

test('거대한·굶주린은 남지 않는다', () => {
  const { r, hits } = lingeringAfterCast(setup('test-dummy', [['bite', V], ['giant', O], ['hungry', O]]))
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
  expect(lingeringAfterCast(setup('test-dummy', [['bite', V], ['blind', O]], frozen)).hits).toEqual([['e0', 7]])
})

test('모두를 꾸미면 전원에게 남는다', () => {
  expect(lingeringAfterCast(setup('test-pair', [['bite', V], ['everyone', O], ['blind', O]])).hits).toEqual([['e0', 1], ['e1', 1]])
})

test('한 적에게만 붙이면 다른 적은 그대로다', () => {
  expect(lingeringAfterCast(setup('test-pair', [['bite', V], ['blind', O]])).hits).toEqual([['e0', 1], ['e1', 3]])
})

test('그러면서로 빌려 온 형용사는 둘째 절의 대상에게도 남는다(같은 카드는 한 개체에 한 번)', () => {
  const s = setup('test-pair', [['bite', V], ['blind', O], ['while', 'connect'], ['bite', { clause: 1, role: 'verb' }], ['mark', { clause: 1, role: 'object' }, 'e1']])
  expect(lingeringAfterCast(s).hits).toEqual([['e0', 1], ['e1', 1]])
  const same = setup('test-dummy', [['bite', V], ['blind', O], ['while', 'connect'], ['bite', { clause: 1, role: 'verb' }]])
  expect(lingeringAfterCast(same).hits).toEqual([['e0', 3]])
})

test('눈먼 두 장은 곱해진다(×0.25)', () => {
  expect(lingeringAfterCast(setup('test-dummy', [['bite', V], ['blind', O], ['blind', O]])).hits).toEqual([['e0', 1]])
})

test('상태가 남은 적이 쓰러져도 오류 없이 무시된다', () => {
  const weak = (s: RallyState): RallyState => ({ ...s, entities: s.entities.map((e) => (e.id === 'e0' ? { ...e, hp: 1 } : e)) })
  const { r, hits } = lingeringAfterCast(setup('test-pair', [['bite', V], ['blind', O]], weak))
  expect(hits).toEqual([['e1', 3]])
  expect(r.state.lingering).toEqual({})
})
