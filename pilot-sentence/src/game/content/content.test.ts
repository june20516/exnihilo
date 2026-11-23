import { FRAMES } from '@/game/grammar/frames'
import { ENCOUNTERS, STARTER_DECK } from './encounters'
import { PRESETS } from './rules'
import { getWord, WORDS } from './words'

test('시작 덱은 15장이고 모두 플레이어용 단어', () => {
  expect(STARTER_DECK).toHaveLength(15)
  for (const id of STARTER_DECK) expect(getWord(id).enemyOnly).toBe(false)
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
  for (const w of pool) expect(w.cost).toBeGreaterThanOrEqual(1)
})

test('없는 단어 id는 예외', () => {
  expect(() => getWord('nope')).toThrow()
})

test('조우 3종이 있고 초기 문장이 문형 슬롯과 허용 품사에 맞는다', () => {
  expect(Object.keys(ENCOUNTERS).sort()).toEqual(['slime', 'spider', 'swarm'])
  for (const encounter of Object.values(ENCOUNTERS)) {
    for (const clause of encounter.initialSentence) {
      const frame = FRAMES[clause.frameId]
      expect(clause.slots.map((s) => s.role).sort()).toEqual(frame.slots.map((s) => s.role).sort())
      for (const slot of clause.slots) {
        const def = frame.slots.find((d) => d.role === slot.role)
        expect(def?.accepts).toContain(getWord(slot.head).kind)
        for (const m of slot.modifiers ?? []) expect(['adjective', 'adverb']).toContain(getWord(m).kind)
      }
    }
    for (const step of encounter.interventionLoop) {
      if ('word' in step) expect(() => getWord(step.word)).not.toThrow()
    }
  }
})

test('프리셋 A/B/C가 spec 10.1의 값을 가진다', () => {
  expect(PRESETS.A).toMatchObject({ handCarry: 'discard', autoDraw: 4, persistence: 'dry', execution: 'auto' })
  expect(PRESETS.A.resource).toEqual({ mode: 'fixed', perTurn: 3 })
  expect(PRESETS.B).toMatchObject({ handCarry: 'keep', handMax: 7, startHand: 4, autoDraw: 1, persistence: 'permanent', execution: 'auto' })
  expect(PRESETS.B.resource).toEqual({ mode: 'ramp', start: 1, max: 6 })
  expect(PRESETS.C).toMatchObject({ handCarry: 'keep', autoDraw: 1, paidDrawCost: 1, persistence: 'untilCast', execution: 'cast' })
  expect(PRESETS.C.resource).toEqual({ mode: 'ink', regen: 3, max: 8, start: 3 })
  for (const preset of Object.values(PRESETS)) expect(preset).toMatchObject({ swapsPerTurn: 1, swapCost: 1 })
})
