import { getWord, type WordDef } from '@/game/content/words'
import { applyStructure, type BuildState, EMPTY_BUILD, effectiveWord } from './build'

const up = (upgrades: BuildState['upgrades']): BuildState => ({ ...EMPTY_BUILD, upgrades })
const damageOf = (def: WordDef) => (def.effect.type === 'verb' ? def.effect.actions.find((a) => a.kind === 'damage') : undefined)
const modsOf = (def: WordDef) => (def.effect.type === 'adjective' || def.effect.type === 'adverb' ? def.effect.mods : [])

test('EMPTY_BUILD는 기본 랠리 값', () => {
  expect(EMPTY_BUILD).toEqual({ slots: { subject: 2, object: 2, verb: 2 }, handMax: 8, discardsPerTurn: 1, upgrades: {}, relics: [] })
})

test('칸은 4에서 멈추고, 손패·버리기는 1씩 오른다', () => {
  let b = EMPTY_BUILD
  for (let i = 0; i < 5; i++) b = applyStructure(b, 'verbSlot')
  expect(b.slots.verb).toBe(4)
  expect(applyStructure(EMPTY_BUILD, 'handSize').handMax).toBe(9)
  expect(applyStructure(EMPTY_BUILD, 'discard').discardsPerTurn).toBe(2)
})

test('강화: 물어뜯는다 6 → 9 → 14', () => {
  expect(damageOf(effectiveWord('bite', up({ bite: 1 })))).toMatchObject({ amount: 9 })
  expect(damageOf(effectiveWord('bite', up({ bite: 2 })))).toMatchObject({ amount: 14 })
})

test('강화: 격렬하게 ×1.5 → ×2 → ×2.5, 굶주린 +4 → +7 → +10, 독을 뿜는 2 → 3 → 4', () => {
  expect(modsOf(effectiveWord('fiercely', up({ fiercely: 1 })))).toContainEqual({ kind: 'powerMul', value: 2 })
  expect(modsOf(effectiveWord('fiercely', up({ fiercely: 2 })))).toContainEqual({ kind: 'powerMul', value: 2.5 })
  expect(modsOf(effectiveWord('hungry', up({ hungry: 2 })))).toContainEqual({ kind: 'outgoingFlat', amount: 10 })
  expect(modsOf(effectiveWord('venomous', up({ venomous: 1 })))).toContainEqual({ kind: 'onHitPoison', amount: 3 })
})

test('강화: 눈먼 ×0.5는 강화되지 않는다', () => {
  expect(modsOf(effectiveWord('blind', up({ blind: 2 })))).toContainEqual({ kind: 'outgoingDamageMul', value: 0.5 })
})

test('강화하지 않은 단어는 원래 정의 객체', () => expect(effectiveWord('bite', EMPTY_BUILD)).toBe(getWord('bite')))
