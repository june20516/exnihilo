import { FRAMES } from '@/game/grammar/frames'
import { ENCOUNTERS, STARTER_DECK } from './encounters'
import { getWord } from './words'

test('시작 덱 단어가 모두 존재하고 플레이어용이다', () => {
  for (const id of STARTER_DECK) expect(getWord(id).enemyOnly).toBe(false)
  expect(STARTER_DECK).toHaveLength(10)
})

test('없는 단어 id는 예외', () => {
  expect(() => getWord('nope')).toThrow()
})

test('모든 조우의 초기 문장이 문형 슬롯과 허용 품사에 맞는다', () => {
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
  }
})

test('개입 루프가 참조하는 단어가 존재한다', () => {
  for (const encounter of Object.values(ENCOUNTERS)) {
    for (const step of encounter.interventionLoop) {
      if ('word' in step) expect(() => getWord(step.word)).not.toThrow()
    }
  }
})
