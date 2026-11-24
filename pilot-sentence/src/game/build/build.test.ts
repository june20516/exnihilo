import { PLAYER_POOL } from '@/game/content/words'
import { getWord, type WordDef } from '@/game/content/words'
import { applyStructure, effectiveWord, EMPTY_BUILD, isUpgradable, type BuildState } from './build'

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

test('강화: 받는 가산(단단한)은 단계마다 +3', () => {
  const mods = (level: 1 | 2) => {
    const effect = effectiveWord('sturdy', { ...EMPTY_BUILD, upgrades: { sturdy: level } }).effect
    return effect.type === 'adjective' ? effect.mods : []
  }
  expect(mods(1)).toEqual([{ kind: 'incomingFlat', amount: 6 }])
  expect(mods(2)).toEqual([{ kind: 'incomingFlat', amount: 9 }])
})

test('강화할 수 있는 단어는 강화하면 정의가 실제로 바뀐다(효과 없는 강화는 팔지 않는다)', () => {
  for (const word of PLAYER_POOL) {
    const changed = JSON.stringify(effectiveWord(word.id, { ...EMPTY_BUILD, upgrades: { [word.id]: 1 } })) !== JSON.stringify(word)
    expect(isUpgradable(word.id), word.id).toBe(changed)
  }
  expect(isUpgradable('twice')).toBe(false)
  expect(isUpgradable('fiercely')).toBe(true)
})

test('떠올린다는 강화하면 장수가 오른다(4 → 6), 되받아친다는 강화할 것이 없다', () => {
  const effect = effectiveWord('recall', { ...EMPTY_BUILD, upgrades: { recall: 1 } }).effect
  expect(effect).toMatchObject({ actions: [{ kind: 'recall', amount: 6 }] })
  expect(isUpgradable('counter')).toBe(false)
})
