import type { WordId } from '@/game/content/words'
import { PLAYER_ID } from '@/game/content/characters'
import { REJECT_MESSAGES } from '@/game/rally/text'
import type { RunState } from '@/game/run/run'
import { getSlot } from '@/game/sentence/board'
import { migrateRunState, parseCommand, type PlayCommand, renderRun, runCommand } from './textPlay'

const run = (state: RunState | null, command: PlayCommand) => runCommand(state, command)
const fresh = (seed = 7): RunState => {
  const state = run(null, { type: 'new', seed }).state
  if (!state) throw new Error('new가 런을 만들지 않았습니다')
  return state
}
/** 전투 손패를 원하는 카드로 바꾼다(번호는 이 순서대로 1부터). */
const withHand = (state: RunState, words: WordId[]): RunState => {
  if (!state.combat) throw new Error('전투 중이 아닙니다')
  const hand = words.map((wordId, i) => ({ instanceId: `t${i}`, wordId }))
  return { ...state, combat: { ...state.combat, deck: { ...state.combat.deck, hand } } }
}
/** 1층을 바로 이긴다: 적 HP를 1로 낮추고 물어뜯는다를 낭독한다. */
const clearFloor = (state: RunState): RunState => {
  if (!state.combat) throw new Error('전투 중이 아닙니다')
  const weak = { ...state.combat, entities: state.combat.entities.map((e) => (e.side === 'enemy' ? { ...e, hp: 1 } : e)) }
  let s = withHand({ ...state, combat: weak }, ['bite'])
  s = run(s, { type: 'place', hand: 1, clause: 1, role: 'verb', modifier: null }).state ?? s
  return run(s, { type: 'cast' }).state ?? s
}

test('명령 해석: 번호는 1부터 세고, 역할은 한국어로 쓴다', () => {
  expect(parseCommand(['place', '3', '1', '주어', '2'])).toEqual({ type: 'place', hand: 3, clause: 1, role: 'subject', modifier: 2 })
  expect(parseCommand(['place', '1', '1', '연결어'])).toEqual({ type: 'place', hand: 1, clause: 1, role: 'connective', modifier: null })
  expect(parseCommand(['discard', '1', '4'])).toEqual({ type: 'discard', hands: [1, 4] })
  expect(parseCommand(['new', '42'])).toEqual({ type: 'new', seed: 42 })
  expect(parseCommand(['new'])).toEqual({ type: 'new', seed: 1 })
  expect(parseCommand(['buy', '2'])).toEqual({ type: 'buy', item: 2 })
  expect(parseCommand(['place', 'x'])).toHaveProperty('error')
  expect(parseCommand(['place', '1', '1', '형용사'])).toHaveProperty('error')
  expect(parseCommand(['place', 'c12', '1', '동사'])).toEqual({ type: 'place', hand: 'c12', clause: 1, role: 'verb', modifier: null })
  expect(parseCommand(['discard', 'c1', '2'])).toEqual({ type: 'discard', hands: ['c1', 2] })
  expect(parseCommand(['fly'])).toHaveProperty('error')
  expect(parseCommand([])).toHaveProperty('error')
})

test('런이 없으면 new부터 하라고 한다', () => {
  const r = run(null, { type: 'show' })
  expect(r.state).toBeNull()
  expect(r.output).toContain('new')
})

test('new: 1층 전투 화면에 층·HP·화폐·적 예고·손패 번호가 있다', () => {
  const r = run(null, { type: 'new', seed: 7 })
  expect(r.state?.floor).toBe(1)
  expect(r.output).toContain('1/7층')
  expect(r.output).toContain('HP 60/60')
  expect(r.output).toContain('화폐 0')
  expect(r.output).toContain('예고:')
  expect(r.output).toMatch(/^ {2}1\. /m)
})

test('place: 손패 번호를 카드로 바꿔 놓는다. 틀린 자리와 없는 번호는 이유를 보여 준다', () => {
  const s = withHand(fresh(), ['bite', 'fiercely'])
  const placed = run(s, { type: 'place', hand: 1, clause: 1, role: 'verb', modifier: null })
  const board = placed.state?.combat?.board
  expect(board && getSlot(board, { clause: 0, role: 'verb' }).head.wordId).toBe('bite')
  expect(placed.output).toContain('당신이 거미를 물어뜯는다')

  expect(run(s, { type: 'place', hand: 1, clause: 1, role: 'subject', modifier: null }).output).toContain(REJECT_MESSAGES.kindMismatch)
  expect(run(s, { type: 'place', hand: 9, clause: 1, role: 'verb', modifier: null }).output).toContain('손패에 9번 카드가 없습니다')
})

test('place 연결어: 연결어 칸에 놓으면 절 2가 열린다', () => {
  const s = withHand(fresh(), ['and', 'bite'])
  const r = run(s, { type: 'place', hand: 1, clause: 1, role: 'connective', modifier: null })
  expect(r.state?.combat?.connective?.wordId).toBe('and')
  expect(r.output).toContain('절 2')
})

test('cast: 낭독 결과와 적 차례가 출력에 나온다', () => {
  let s = withHand(fresh(), ['bite'])
  s = run(s, { type: 'place', hand: 1, clause: 1, role: 'verb', modifier: null }).state ?? s
  const r = run(s, { type: 'cast' })
  expect(r.output).toContain('탐험가 → 거미: 피해 6')
  expect(r.output).toContain('적 차례')
})

test('손패가 가득 차 넘친 카드는 버림 더미로 갔다고 알려 준다', () => {
  let s = withHand(fresh(), ['bite', 'guard', 'guard', 'hide', 'rage', 'scare', 'mend', 'fiercely'])
  s = run(s, { type: 'place', hand: 1, clause: 1, role: 'verb', modifier: null }).state ?? s
  expect(run(s, { type: 'cast' }).output).toMatch(/손패가 가득 차 .+ 버림 더미로/)
})

test('상점: 1층을 이기면 보상·값·화폐가 보이고, 사면 화폐가 줄고 남은 값이 오른다', () => {
  const shop = clearFloor(fresh())
  expect(shop.phase).toBe('shop')
  const screen = renderRun(shop)
  expect(screen).toContain('상점')
  expect(screen).toContain(`화폐 ${shop.gold}`)
  const items = shop.shop?.items ?? []
  const cheapest = items.reduce((best, item, i) => (item.price < items[best].price ? i : best), 0)
  const bought = run(shop, { type: 'buy', item: cheapest + 1 })
  expect(bought.state?.gold).toBe(shop.gold - items[cheapest].price)
  expect(bought.output).toContain('샀습니다')
  const other = items.findIndex((_, i) => i !== cheapest)
  expect(bought.state?.shop?.items[other].price).toBeGreaterThan(items[other].price)
  expect(bought.output).toContain('팔림')

  const left = run(bought.state, { type: 'leave' })
  expect(left.state?.floor).toBe(2)
  expect(left.output).toContain('2/7층')
})

test('지금 할 수 없는 명령은 거부 문구를 보여 준다', () => {
  expect(run(fresh(), { type: 'buy', item: 1 }).output).toContain(REJECT_MESSAGES.notPlayerTurn)
  const shop = clearFloor(fresh())
  expect(run(shop, { type: 'cast' }).output).toContain(REJECT_MESSAGES.notPlayerTurn)
})

test('런 종료 화면: 결과·도달 층·최대 한 방·산 것', () => {
  const s = fresh()
  const lost: RunState = {
    ...s,
    phase: 'lost',
    hp: 0,
    combat: s.combat && { ...s.combat, entities: s.combat.entities.map((e) => (e.id === PLAYER_ID ? { ...e, hp: 0 } : e)) },
  }
  const screen = renderRun(lost)
  expect(screen).toContain('패배')
  expect(screen).toContain('1/7층')
  expect(screen).toContain('최대 한 방')
})

test('런 상태는 JSON으로 저장했다 읽어도 같다', () => {
  const s = clearFloor(fresh())
  expect(JSON.parse(JSON.stringify(s))).toEqual(s)
})

test('카드 id로도 놓을 수 있고, 손패 목록에 id가 보인다', () => {
  const s = withHand(fresh(), ['fiercely', 'bite'])
  expect(renderRun(s)).toMatch(/^ {2}2\. \(t1\) 물어뜯는다/m)
  const placed = run(s, { type: 'place', hand: 't1', clause: 1, role: 'verb', modifier: null })
  const board = placed.state?.combat?.board
  expect(board && getSlot(board, { clause: 0, role: 'verb' }).head.wordId).toBe('bite')
  expect(run(s, { type: 'place', hand: 'c99', clause: 1, role: 'verb', modifier: null }).output).toContain('손패에 c99 카드가 없습니다')
})

test('이미 놓인 카드를 밀어내면 손패로 돌아갔다고 알려 준다', () => {
  let s = withHand(fresh(), ['bite', 'slash'])
  s = run(s, { type: 'place', hand: 't0', clause: 1, role: 'verb', modifier: null }).state ?? s
  expect(run(s, { type: 'place', hand: 't1', clause: 1, role: 'verb', modifier: null }).output).toContain('물어뜯는다은(는) 밀려나 손패로')
})

test('허수아비 화자: 미리보기에 내부 id 대신 허수아비 이름이 나온다', () => {
  const base = withHand(fresh(), ['bite'])
  const build = { ...base.build, relics: ['scarecrowSpeaker' as const] }
  let s: RunState = { ...base, build, combat: base.combat && { ...base.combat, build } }
  s = run(s, { type: 'place', hand: 1, clause: 1, role: 'verb', modifier: null }).state ?? s
  const preview = renderRun(s).split('미리보기')[1] ?? ''
  expect(preview).toContain('허수아비 → 거미')
  expect(preview).not.toMatch(/\bt\d+\b/)
})

test('강화: 산 뒤에는 단계 화살표 대신 빌드 요약에 지금 단계가 보인다', () => {
  const shop = clearFloor(fresh())
  const withUpgrade: RunState = {
    ...shop,
    gold: 100,
    shop: { items: [{ offer: { kind: 'upgrade', wordId: 'fiercely' }, price: 8, sold: false }] },
  }
  expect(renderRun(withUpgrade)).toContain('격렬하게 0→1단계')
  const bought = run(withUpgrade, { type: 'buy', item: 1 })
  expect(bought.output).not.toContain('1→2단계')
  expect(bought.output).toContain('강화: 격렬하게 1단계')
})


test('적 줄에 낭독하면 남을 형용사 상태가 보인다', () => {
  let s = withHand(fresh(), ['bite', 'blind'])
  s = run(s, { type: 'place', hand: 't0', clause: 1, role: 'verb', modifier: null }).state ?? s
  const r = run(s, { type: 'place', hand: 't1', clause: 1, role: 'object', modifier: null })
  expect(r.output).toMatch(/1\. 거미 HP [^\n]*눈멂 · 적 차례까지/)
})

test('남은 형용사 상태도 JSON으로 저장했다 읽으면 같다', () => {
  const s = fresh()
  const withLingering: RunState = { ...s, combat: s.combat && { ...s.combat, lingering: { e0: ['blind'] } } }
  expect(JSON.parse(JSON.stringify(withLingering))).toEqual(withLingering)
})

test('내 HP 줄에도 낭독하면 남을 형용사 상태가 보인다', () => {
  let s = withHand(fresh(), ['bite', 'sturdy'])
  s = run(s, { type: 'place', hand: 't0', clause: 1, role: 'verb', modifier: null }).state ?? s
  const r = run(s, { type: 'place', hand: 't1', clause: 1, role: 'subject', modifier: null })
  expect(r.output).toMatch(/^HP 60\/60[^\n]*단단함 · 적 차례까지/m)
})

test('형용사 상태 이전에 저장한 파일(lingering 없음)도 보정해 읽는다', () => {
  const s = fresh()
  const legacy: unknown = JSON.parse(JSON.stringify(s, (key, value: unknown) => (key === 'lingering' ? undefined : value)))
  const migrated = migrateRunState(legacy)
  expect(migrated?.combat?.lingering).toEqual({})
  expect(() => run(migrated, { type: 'show' })).not.toThrow()
  expect(migrateRunState({ hello: 1 })).toBeNull()
})
