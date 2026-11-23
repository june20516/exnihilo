import { BALANCE } from '@/game/content/balance'
import type { WordId } from '@/game/content/words'
import type { CardInst } from '@/game/rally/combat'
import { type RunAction, type RunState, reduceRun, startRun } from './run'

const act = (s: RunState, a: RunAction) => reduceRun(s, a, BALANCE)

/** 이번 층 전투를 바로 이긴다: 첫 적만 HP 1로 남기고 나머지는 쓰러뜨린 뒤 동사 한 장으로 낭독. */
function winFloor(run: RunState): RunState {
  const combat = run.combat
  if (!combat) throw new Error('전투 중이 아닙니다.')
  let enemyIndex = 0
  const entities = combat.entities.map((e) => (e.side !== 'enemy' ? e : { ...e, hp: enemyIndex++ === 0 ? 1 : 0, statuses: { ...e.statuses, block: 0 } }))
  const hand: CardInst[] = [{ instanceId: 'w0', wordId: 'bite' as WordId }]
  let s: RunState = { ...run, combat: { ...combat, entities, targetId: 'e0', deck: { ...combat.deck, hand: [...combat.deck.hand, ...hand] } } }
  s = act(s, { type: 'combat', action: { type: 'place', instanceId: 'w0', at: { clause: 0, role: 'verb' } } }).state
  return act(s, { type: 'combat', action: { type: 'cast' } }).state
}
const hurt = (run: RunState, hp: number): RunState => ({
  ...run,
  combat: run.combat && { ...run.combat, entities: run.combat.entities.map((e) => (e.id === 'p' ? { ...e, hp } : e)) },
})

test('시작: 1층 전투, HP 60, 화폐 0', () => {
  const s = startRun(1, BALANCE).state
  expect(s).toMatchObject({ floor: 1, phase: 'combat', hp: 60, maxHp: 60, gold: 0 })
  expect(s.combat?.encounterId).toMatch(/^(spider|swarm|slime)$/)
})

test('1층 승리 → 화폐 10, 회복 20%(최대 HP 초과 없음), 상점', () => {
  const r = winFloor(hurt(startRun(1, BALANCE).state, 30))
  expect(r).toMatchObject({ phase: 'shop', gold: 10, hp: 42 })
  expect(r.shop?.items).toHaveLength(3)
  expect(winFloor(hurt(startRun(1, BALANCE).state, 55)).hp).toBe(60)
})

test('구매: 화폐 차감과 반영, 모자라면 notEnoughGold, 두 번 사면 soldOut', () => {
  const shopState = { ...winFloor(startRun(2, BALANCE).state), gold: 100 }
  const cheapest = shopState.shop?.items.reduce((best, item, i, all) => (item.price < all[best].price ? i : best), 0) ?? 0
  const bought = act(shopState, { type: 'buy', index: cheapest })
  const item = shopState.shop?.items[cheapest]
  expect(bought.state.gold).toBe(100 - (item?.price ?? 0))
  expect(bought.state.log.purchases).toEqual([item?.offer])
  expect(act(bought.state, { type: 'buy', index: cheapest }).events[0]).toMatchObject({ reason: 'soldOut' })
  expect(act({ ...shopState, gold: 0 }, { type: 'buy', index: 0 }).events[0]).toMatchObject({ reason: 'notEnoughGold' })
})

test('구매 효과: 단어는 덱에, 강화·구조·유물은 빌드에', () => {
  const base = { ...winFloor(startRun(3, BALANCE).state), gold: 999 }
  const withItems = (offer: NonNullable<RunState['shop']>['items'][number]['offer']): RunState => ({ ...base, shop: { items: [{ offer, price: 1, sold: false }] } })
  expect(act(withItems({ kind: 'word', wordId: 'so' }), { type: 'buy', index: 0 }).state.deck).toContain('so')
  expect(act(withItems({ kind: 'upgrade', wordId: 'bite' }), { type: 'buy', index: 0 }).state.build.upgrades.bite).toBe(1)
  expect(act(withItems({ kind: 'structure', id: 'verbSlot' }), { type: 'buy', index: 0 }).state.build.slots.verb).toBe(3)
  expect(act(withItems({ kind: 'relic', id: 'echo' }), { type: 'buy', index: 0 }).state.build.relics).toContain('echo')
})

test('leave → 2층 전투, 빌드와 HP가 이어진다', () => {
  const shop = { ...winFloor(hurt(startRun(4, BALANCE).state, 30)), build: { ...startRun(4, BALANCE).state.build, relics: ['echo' as const] } }
  const next = act(shop, { type: 'leave' }).state
  expect(next).toMatchObject({ floor: 2, phase: 'combat' })
  expect(next.combat?.entities.find((e) => e.id === 'p')?.hp).toBe(42)
  expect(next.combat?.build.relics).toEqual(['echo'])
})

test('3층은 거미 여왕, 6층은 문지기, 7층은 필경사. 4·5층은 적 HP ×1.3', () => {
  let s = startRun(5, BALANCE).state
  const seen: string[] = []
  for (let floor = 1; floor <= 7; floor++) {
    seen.push(s.combat?.encounterId ?? '')
    if (floor === 4) expect(s.combat?.enemyScale).toEqual({ hp: 1.3, damage: 1.2 })
    s = winFloor(s)
    if (floor < 7) s = act(s, { type: 'leave' }).state
  }
  expect(seen[2]).toBe('queen')
  expect(seen[5]).toBe('gatekeeper')
  expect(seen[6]).toBe('scribe')
  expect(s.phase).toBe('won')
  expect(s.shop).toBeNull()
})

test('정예 승리는 화폐 20', () => {
  let s = startRun(6, BALANCE).state
  for (let floor = 1; floor <= 2; floor++) s = act(winFloor(s), { type: 'leave' }).state
  const before = s.gold
  expect(winFloor(s).gold - before).toBe(20)
})

test('패배 → lost, 이후 행동 거부', () => {
  const s = hurt(startRun(7, BALANCE).state, 1)
  const r = act(s, { type: 'combat', action: { type: 'endTurn' } })
  expect(r.state.phase).toBe('lost')
  expect(r.events).toContainEqual({ type: 'runEnded', outcome: 'lost' })
  expect(act(r.state, { type: 'leave' }).events[0]).toMatchObject({ type: 'rejected' })
})

test('같은 시드는 같은 런(결정적)', () => {
  const play = (seed: number) => act(winFloor(startRun(seed, BALANCE).state), { type: 'leave' }).state
  expect(play(11)).toEqual(play(11))
})
