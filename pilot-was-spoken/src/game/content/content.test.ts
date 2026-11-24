import { CHARACTERS, DEFAULT_CHARACTER } from './characters'
import { FRAMES } from '@/game/grammar/frames'
import { RALLY_ENCOUNTERS } from './enemies'
import { getWord, WORDS } from './words'

test('시작 덱은 15장, 모두 플레이어용 단어, 동사 10장', () => {
  expect(CHARACTERS[DEFAULT_CHARACTER].starterDeck).toHaveLength(15)
  for (const id of CHARACTERS[DEFAULT_CHARACTER].starterDeck) expect(getWord(id).enemyOnly).toBe(false)
  expect(CHARACTERS[DEFAULT_CHARACTER].starterDeck.filter((id) => getWord(id).effect.type === 'verb')).toHaveLength(10)
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

test('조우 6종이 있고, 모든 적의 예고 문장이 문형 슬롯과 허용 품사에 맞는다', () => {
  const real = Object.keys(RALLY_ENCOUNTERS).filter((id) => !id.startsWith('test-'))
  expect(real.sort()).toEqual(['gatekeeper', 'queen', 'scribe', 'slime', 'spider', 'swarm'])
  for (const id of real) {
    for (const enemy of RALLY_ENCOUNTERS[id].enemies) {
      expect(enemy.intents.length).toBeGreaterThan(0)
      for (const intent of enemy.intents) {
        if (intent.kind !== 'clause') continue
        const clause = intent.clause
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

test('조우 6종: 일반 3, 정예 2, 보스 1', () => {
  const real = Object.values(RALLY_ENCOUNTERS).filter((e) => !e.id.startsWith('test-'))
  const count = (tier: string) => real.filter((e) => e.tier === tier).map((e) => e.id).sort()
  expect(count('normal')).toEqual(['slime', 'spider', 'swarm'])
  expect(count('elite')).toEqual(['gatekeeper', 'queen'])
  expect(count('boss')).toEqual(['scribe'])
})
