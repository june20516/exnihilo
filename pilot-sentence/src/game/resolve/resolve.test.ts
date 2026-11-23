import { addStatus, createEntity, type Entity } from '@/kit/core/entity'
import type { SlotAddress } from '@/game/content/enemies'
import { SPIDER_SENTENCE } from '@/game/sentence/testSentence'
import type { WordId } from '@/game/content/words'
import { type Board, buildBoard, placeWord, type PlacedWord } from '@/game/sentence/board'
import { resolveClause, resolveTargets } from './resolve'

const player = () => createEntity({ id: 'p', defId: 'player', name: '탐험가', side: 'ally', hp: 60 })
const spider = (hp = 30) => createEntity({ id: 'e1', defId: 'spider', name: '거미', side: 'enemy', hp })
const scarecrow = () => createEntity({ id: 't9', defId: 'scarecrow', name: '허수아비', side: 'ally', hp: 8 })
const board0 = () => buildBoard(SPIDER_SENTENCE, 2)
const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const

function put(board: Board, at: SlotAddress, wordId: WordId, extra: Partial<PlacedWord> & { index?: number } = {}): Board {
  const { index, ...rest } = extra
  const word: PlacedWord = { wordId, owner: 'player', instanceId: wordId, targetEntityId: null, ...rest }
  const r = placeWord(board, at, word, index)
  if (!r.ok) throw new Error(`배치 실패: ${wordId} → ${r.reason}`)
  return r.board
}
/** 거미 원문 문장에서 주어를 당신, 목적어를 거미로 바꾼 보드. */
const youAttackSpider = () => put(put(board0(), S, 'you'), O, 'mark', { targetEntityId: 'e1' })
let counter = 0
const newId = () => `n${counter++}`
const run = (board: Board, entities: Entity[], executions = 0) => resolveClause(board, 0, entities, newId, { executions })
const find = (entities: readonly Entity[], id: string) => {
  const e = entities.find((x) => x.id === id)
  if (!e) throw new Error(`개체 없음: ${id}`)
  return e
}

describe('대상 해석', () => {
  test('플레이어, 적 정의, 소환 요청, 지목', () => {
    const es = [player(), spider()]
    const w: PlacedWord = { wordId: 'you', owner: 'player', instanceId: 'a', targetEntityId: null }
    expect(resolveTargets(w, es)).toEqual({ ids: ['p'], summon: null })
    expect(resolveTargets({ ...w, wordId: 'spider' }, es)).toEqual({ ids: ['e1'], summon: null })
    expect(resolveTargets({ ...w, wordId: 'scarecrow' }, es)).toEqual({ ids: [], summon: 'scarecrow' })
    expect(resolveTargets({ ...w, wordId: 'mark', targetEntityId: 'e1' }, es)).toEqual({ ids: ['e1'], summon: null })
  })

  test('우리는 나와 아군 토큰, 모두는 살아 있는 전원', () => {
    const es = [player(), spider(), scarecrow(), { ...createEntity({ id: 'e2', defId: 'spider', name: '거미', side: 'enemy', hp: 5 }), hp: 0 }]
    const w: PlacedWord = { wordId: 'allies', owner: 'player', instanceId: 'a', targetEntityId: null }
    expect(resolveTargets(w, es).ids).toEqual(['p', 't9'])
    expect(resolveTargets({ ...w, wordId: 'everyone' }, es).ids).toEqual(['p', 'e1', 't9'])
  })
})

describe('기본 실행', () => {
  test('초기 문장: 거미가 당신에게 피해 6 + 독 2', () => {
    const r = run(board0(), [player(), spider()])
    expect(find(r.entities, 'p').hp).toBe(54)
    expect(find(r.entities, 'p').statuses.poison).toBe(2)
    expect(r.events[0]).toEqual({ type: 'clauseExecuted', clause: 0 })
  })

  test('주어를 당신, 목적어를 거미로 바꾸면 독을 뿜는은 내 공격에 붙는다', () => {
    const r = run(youAttackSpider(), [player(), spider()])
    expect(find(r.entities, 'e1').hp).toBe(24)
    expect(find(r.entities, 'e1').statuses.poison).toBe(2)
  })

  test('격렬하게 + 눈먼 → floor(6 × 1.5 × 0.5) = 4', () => {
    const r = run(put(put(board0(), V, 'fiercely'), S, 'blind'), [player(), spider()])
    expect(find(r.entities, 'p').hp).toBe(56)
  })

  test('보호에 다 막히면 독이 걸리지 않는다', () => {
    const r = run(board0(), [addStatus(player(), 'block', 10), spider()])
    expect(find(r.entities, 'p').statuses.poison).toBe(0)
  })

  test('없는 허수아비는 소환되어 대신 맞는다', () => {
    const r = run(put(board0(), O, 'scarecrow'), [player(), spider()])
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'summoned', tokenId: 'scarecrow' }))
    expect(r.entities.find((e) => e.defId === 'scarecrow')?.hp).toBe(2)
  })

  test('막는다는 주어에게 보호 6, 치유한다는 목적어 회복 6', () => {
    expect(find(run(put(board0(), V, 'guard'), [player(), spider()]).entities, 'e1').statuses.block).toBe(6)
    const r = run(put(board0(), V, 'mend'), [{ ...player(), hp: 50 }, spider()])
    expect(find(r.entities, 'p').hp).toBe(56)
  })

  test('빙결된 주어는 불발하고 빙결을 소모, 기어이는 빙결을 무시', () => {
    const frozen = addStatus(spider(), 'freeze', 1)
    const r = run(board0(), [player(), frozen])
    expect(r.events).toContainEqual({ type: 'fizzled', clause: 0, reason: 'frozen' })
    expect(find(r.entities, 'e1').statuses.freeze).toBe(0)
    expect(find(run(put(board0(), V, 'persist'), [player(), frozen]).entities, 'p').hp).toBe(54)
  })

  test('목적어가 죽으면 died 한 번(피해 직후), 살아 있는 목적어가 없으면 불발', () => {
    const r = run(youAttackSpider(), [player(), spider(3)])
    const types = r.events.map((e) => e.type)
    expect(types.filter((t) => t === 'died')).toHaveLength(1)
    expect(types.indexOf('died')).toBe(types.indexOf('damaged') + 1)
    expect(run(youAttackSpider(), r.entities).events).toContainEqual({ type: 'fizzled', clause: 0, reason: 'noObject' })
  })
})

describe('자동사와 그룹', () => {
  test('자동사는 목적어를 무시한다: 거미가 분노한다 → 거미 힘 2, 당신 무사', () => {
    const r = run(put(board0(), V, 'rage'), [player(), spider()])
    expect(find(r.entities, 'e1').statuses.strength).toBe(2)
    expect(find(r.entities, 'p').hp).toBe(60)
  })

  test('우리가 거미를 물어뜯는다 → 나와 허수아비가 각각 공격', () => {
    const b = put(put(board0(), S, 'allies'), O, 'mark', { targetEntityId: 'e1' })
    const r = run(b, [player(), spider(), scarecrow()])
    expect(r.events.filter((e) => e.type === 'damaged' && e.entityId === 'e1')).toHaveLength(2)
    expect(find(r.entities, 'e1').hp).toBe(30 - 6 - 6)
  })

  test('모두가 무너진다 → 나를 포함해 전원 HP 10 손실', () => {
    const r = run(put(put(board0(), S, 'everyone'), V, 'collapse'), [player(), spider()])
    expect(find(r.entities, 'p').hp).toBe(50)
    expect(find(r.entities, 'e1').hp).toBe(20)
  })
})

describe('상태와 수식', () => {
  test('힘 +2 → 8, 약화 → floor(6 × 0.75) = 4, 취약 대상 → 9', () => {
    expect(find(run(board0(), [player(), addStatus(spider(), 'strength', 2)]).entities, 'p').hp).toBe(52)
    expect(find(run(board0(), [player(), addStatus(spider(), 'weak', 1)]).entities, 'p').hp).toBe(56)
    expect(find(run(board0(), [addStatus(player(), 'vulnerable', 1), spider()]).entities, 'p').hp).toBe(51)
  })

  test('목적어의 단단한은 −3, 금이 간은 ×1.5', () => {
    expect(find(run(put(board0(), O, 'sturdy'), [player(), spider()]).entities, 'p').hp).toBe(57)
    expect(find(run(put(board0(), O, 'cracked'), [player(), spider()]).entities, 'p').hp).toBe(51)
  })

  test('굶주린 주어: 피해 +4, 실행 후 자신 HP 2 손실', () => {
    const r = run(put(board0(), S, 'hungry'), [player(), spider()])
    expect(find(r.entities, 'p').hp).toBe(50)
    expect(find(r.entities, 'e1').hp).toBe(28)
  })

  test('거듭: 지금까지 실행 횟수만큼 위력 +1', () => {
    expect(find(run(put(board0(), V, 'again'), [player(), spider()], 3).entities, 'p').hp).toBe(51)
  })

  test('두 번: 2회 실행, 첫 번째에 죽은 대상은 두 번째에서 빠진다', () => {
    const b = put(youAttackSpider(), V, 'twice')
    const r = run(b, [player(), spider(8)])
    expect(r.events.filter((e) => e.type === 'damaged' && e.entityId === 'e1')).toHaveLength(2)
    const r2 = run(b, [player(), spider(3)])
    expect(r2.events.filter((e) => e.type === 'damaged' && e.entityId === 'e1')).toHaveLength(1)
  })
})

describe('대가형 동사', () => {
  test('삼킨다: 피해 5, 준 만큼 주어 회복', () => {
    const r = run(put(youAttackSpider(), V, 'devour'), [{ ...player(), hp: 50 }, spider()])
    expect(find(r.entities, 'e1').hp).toBe(25)
    expect(find(r.entities, 'p').hp).toBe(55)
  })

  test('희생한다: 주어 HP 6 손실, 목적어 피해 15', () => {
    const r = run(put(youAttackSpider(), V, 'sacrifice'), [player(), spider()])
    expect(find(r.entities, 'p').hp).toBe(54)
    expect(find(r.entities, 'e1').hp).toBe(15)
  })

  test('끌어안는다: 서로 피해 4, 둘 다 빙결', () => {
    const r = run(put(youAttackSpider(), V, 'embrace'), [player(), spider()])
    expect(find(r.entities, 'p').hp).toBe(56)
    expect(find(r.entities, 'e1').hp).toBe(26)
    expect(find(r.entities, 'p').statuses.freeze).toBe(1)
    expect(find(r.entities, 'e1').statuses.freeze).toBe(1)
  })

  test('부풀어 오른다: 최대 HP와 HP +6, 정신 차린다: 독·약화·빙결 제거', () => {
    const r = run(put(board0(), V, 'swell'), [player(), spider()])
    expect(find(r.entities, 'e1')).toMatchObject({ hp: 36, maxHp: 36 })
    const sick = addStatus(addStatus(spider(), 'poison', 3), 'weak', 2)
    const c = run(put(board0(), V, 'recover'), [player(), sick])
    expect(find(c.entities, 'e1').statuses).toMatchObject({ poison: 0, weak: 0 })
  })
})
