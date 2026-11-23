import { FRAMES } from '@/game/grammar/frames'
import { RALLY_ENCOUNTERS, RALLY_STARTER_DECK } from './enemies'
import { getWord, WORDS } from './words'

test('시작 덱은 15장, 모두 플레이어용 단어, 동사 10장', () => {
  expect(RALLY_STARTER_DECK).toHaveLength(15)
  for (const id of RALLY_STARTER_DECK) expect(getWord(id).enemyOnly).toBe(false)
  expect(RALLY_STARTER_DECK.filter((id) => getWord(id).effect.type === 'verb')).toHaveLength(10)
})

test('플레이어 카드 풀은 32장 이상, 요소별로 5장 이상', () => {
  const pool = Object.values(WORDS).filter((w) => !w.enemyOnly && w.kind !== 'junk')
  expect(pool.length).toBeGreaterThanOrEqual(32)
  const count = (pred: (k: string) => boolean) => pool.filter((w) => pred(w.kind)).length
  expect(count((k) => k === 'target')).toBeGreaterThanOrEqual(5)
  expect(count((k) => k === 'verbTransitive')).toBeGreaterThanOrEqual(5)
  expect(count((k) => k === 'verbIntransitive')).toBeGreaterThanOrEqual(5)
  expect(count((k) => k === 'adjective')).toBeGreaterThanOrEqual(5)
  expect(count((k) => k === 'adverb')).toBeGreaterThanOrEqual(5)
})

test('없는 단어 id는 예외', () => {
  expect(() => getWord('nope')).toThrow()
})

test('조우 3종이 있고, 모든 적의 예고 문장이 문형 슬롯과 허용 품사에 맞는다', () => {
  const real = Object.keys(RALLY_ENCOUNTERS).filter((id) => !id.startsWith('test-'))
  expect(real.sort()).toEqual(['slime', 'spider', 'swarm'])
  for (const id of real) {
    for (const enemy of RALLY_ENCOUNTERS[id].enemies) {
      expect(enemy.intents.length).toBeGreaterThan(0)
      for (const clause of enemy.intents) {
        const frame = FRAMES[clause.frameId]
        expect(clause.slots.map((s) => s.role).sort()).toEqual(frame.slots.map((s) => s.role).sort())
        for (const slot of clause.slots) {
          expect(frame.slots.find((d) => d.role === slot.role)?.accepts).toContain(getWord(slot.head).kind)
          for (const m of slot.modifiers ?? []) expect(['adjective', 'adverb']).toContain(getWord(m).kind)
        }
      }
    }
  }
})
