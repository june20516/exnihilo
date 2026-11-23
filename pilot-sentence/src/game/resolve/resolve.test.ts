import { addStatus, createEntity, type Entity } from '@/kit/core/entity'
import { ENCOUNTERS, type SlotAddress } from '@/game/content/encounters'
import type { WordId } from '@/game/content/words'
import { type Board, buildBoard, placeWord, type PlacedWord } from '@/game/sentence/board'
import { resolveClause, resolveTargets } from './resolve'

const player = () => createEntity({ id: 'p', defId: 'player', name: '탐험가', side: 'ally', hp: 60 })
const spider = () => createEntity({ id: 'e1', defId: 'spider', name: '거미', side: 'enemy', hp: 30 })
const board0 = () => buildBoard(ENCOUNTERS.spider.initialSentence, 2)
const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const

function put(board: Board, at: SlotAddress, wordId: WordId, extra: Partial<PlacedWord> = {}): Board {
  const r = placeWord(board, at, { wordId, owner: 'player', inkLeft: 2, instanceId: wordId, targetEntityId: null, ...extra })
  if (!r.ok) throw new Error('배치 실패')
  return r.board
}
let counter = 0
const newId = () => `t${counter++}`
const find = (entities: readonly Entity[], id: string) => {
  const e = entities.find((x) => x.id === id)
  if (!e) throw new Error(`개체 없음: ${id}`)
  return e
}

test('resolveTargets: 플레이어, 적 정의, 없는 토큰은 소환 요청', () => {
  const es = [player(), spider()]
  const you: PlacedWord = { wordId: 'you', owner: 'player', inkLeft: 2, instanceId: 'a', targetEntityId: null }
  expect(resolveTargets(you, es)).toEqual({ ids: ['p'], summon: null })
  expect(resolveTargets({ ...you, wordId: 'spider' }, es)).toEqual({ ids: ['e1'], summon: null })
  expect(resolveTargets({ ...you, wordId: 'scarecrow' }, es)).toEqual({ ids: [], summon: 'scarecrow' })
  expect(resolveTargets({ ...you, wordId: 'mark', targetEntityId: 'e1' }, es)).toEqual({ ids: ['e1'], summon: null })
})

test('초기 문장: 거미가 당신에게 피해 6 + 독 2', () => {
  const r = resolveClause(board0(), 0, [player(), spider()], newId)
  expect(find(r.entities, 'p').hp).toBe(54)
  expect(find(r.entities, 'p').statuses.poison).toBe(2)
  expect(r.events[0]).toEqual({ type: 'clauseExecuted', clause: 0 })
  expect(r.events).toContainEqual({ type: 'damaged', entityId: 'p', amount: 6, blocked: 0, sourceId: 'e1' })
})

test('주어를 당신, 목적어를 지목(거미)으로: 거미가 6 피해, 독을 뿜는은 내 공격에 붙는다', () => {
  let b = put(board0(), S, 'you')
  b = put(b, O, 'mark', { targetEntityId: 'e1' })
  const r = resolveClause(b, 0, [player(), spider()], newId)
  expect(find(r.entities, 'e1').hp).toBe(24)
  expect(find(r.entities, 'e1').statuses.poison).toBe(2)
  expect(find(r.entities, 'p').hp).toBe(60)
})

test('격렬하게 + 눈먼 → floor(6 × 1.5 × 0.5) = 4', () => {
  let b = put(board0(), V, 'fiercely')
  b = put(b, S, 'blind')
  const r = resolveClause(b, 0, [player(), spider()], newId)
  expect(find(r.entities, 'p').hp).toBe(56)
})

test('보호에 다 막히면 독이 걸리지 않는다', () => {
  const r = resolveClause(board0(), 0, [addStatus(player(), 'block', 10), spider()], newId)
  expect(find(r.entities, 'p').statuses.poison).toBe(0)
})

test('목적어 허수아비는 없으면 소환되어 대신 맞는다', () => {
  const r = resolveClause(put(board0(), O, 'scarecrow'), 0, [player(), spider()], newId)
  expect(r.events).toContainEqual(expect.objectContaining({ type: 'summoned', tokenId: 'scarecrow' }))
  const token = r.entities.find((e) => e.defId === 'scarecrow')
  expect(token?.hp).toBe(2)
  expect(token?.side).toBe('ally')
  expect(find(r.entities, 'p').hp).toBe(60)
})

test('막는다: 주어에게 보호 6, 격렬하게면 9', () => {
  const r = resolveClause(put(board0(), V, 'guard'), 0, [player(), spider()], newId)
  expect(find(r.entities, 'e1').statuses.block).toBe(6)
  const r2 = resolveClause(put(put(board0(), V, 'guard'), V, 'fiercely'), 0, [player(), spider()], newId)
  expect(find(r2.entities, 'e1').statuses.block).toBe(9)
})

test('치유한다: 목적어 회복 5', () => {
  const hurt = { ...player(), hp: 50 }
  const r = resolveClause(put(board0(), V, 'mend'), 0, [hurt, spider()], newId)
  expect(find(r.entities, 'p').hp).toBe(55)
  expect(r.events).toContainEqual({ type: 'healed', entityId: 'p', amount: 5 })
})

test('빙결된 주어는 불발하고 빙결을 소모', () => {
  const r = resolveClause(board0(), 0, [player(), addStatus(spider(), 'freeze', 1)], newId)
  expect(r.events).toContainEqual({ type: 'fizzled', clause: 0, reason: 'frozen' })
  expect(find(r.entities, 'e1').statuses.freeze).toBe(0)
  expect(find(r.entities, 'p').hp).toBe(60)
})

test('목적어가 죽으면 died 한 번, 살아있는 목적어가 없으면 불발', () => {
  let b = put(board0(), S, 'you')
  b = put(b, O, 'mark', { targetEntityId: 'e1' })
  const weak = { ...spider(), hp: 3 }
  const r = resolveClause(b, 0, [player(), weak], newId)
  expect(r.events.filter((e) => e.type === 'died')).toEqual([{ type: 'died', entityId: 'e1' }])
  const again = resolveClause(b, 0, r.entities, newId)
  expect(again.events).toContainEqual({ type: 'fizzled', clause: 0, reason: 'noObject' })
})

test('주어가 죽어 있으면 noSubject 불발', () => {
  const r = resolveClause(board0(), 0, [player(), { ...spider(), hp: 0 }], newId)
  expect(r.events).toContainEqual({ type: 'fizzled', clause: 0, reason: 'noSubject' })
})

test('사망 이벤트는 해당 피해 이벤트 바로 뒤에 온다', () => {
  let b = put(board0(), S, 'you')
  b = put(b, O, 'mark', { targetEntityId: 'e1' })
  const r = resolveClause(b, 0, [player(), { ...spider(), hp: 3 }], newId)
  const types = r.events.map((e) => e.type)
  expect(types.indexOf('died')).toBe(types.indexOf('damaged') + 1)
})
