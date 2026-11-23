import { createEntity } from '@/kit/core/entity'
import type { ClauseSpec, SlotAddress } from '@/game/content/enemies'
import { resolveClause } from '@/game/resolve/resolve'
import { type Board, type PlacedWord, placeWord } from '@/game/sentence/board'
import { blankSentence, enemyBoard, firstAliveEnemy, hasVerb, isDefensiveVerb, materialize } from './sentence'

const P = createEntity({ id: 'p', defId: 'player', name: '탐험가', side: 'ally', hp: 60 })
const E0 = createEntity({ id: 'e0', defId: 'spiderling', name: '새끼 거미 1', side: 'enemy', hp: 10 })
const E1 = createEntity({ id: 'e1', defId: 'spiderling', name: '새끼 거미 2', side: 'enemy', hp: 10 })
const V = { clause: 0, role: 'verb' } as const
const card = (wordId: string, id = wordId): PlacedWord => ({ wordId, owner: 'player', inkLeft: null, instanceId: id, targetEntityId: null })
const put = (board: Board, at: SlotAddress, word: PlacedWord) => {
  const r = placeWord(board, at, word)
  if (!r.ok) throw new Error(r.reason)
  return r.board
}
const run = (board: Board, entities = [P, E0, E1]) => resolveClause(board, 0, entities, () => 'x', { executions: 0 })

test('빈 문장에는 동사가 없다', () => expect(hasVerb(blankSentence(2))).toBe(false))

test('동사를 놓으면 동사가 있다', () => expect(hasVerb(put(blankSentence(2), V, card('bite')))).toBe(true))

test('동사 한 장만 놓으면: (당신이) (지정한 적을) 물어뜯는다', () => {
  const r = run(materialize(put(blankSentence(2), V, card('bite')), 'e1'))
  expect(r.events).toContainEqual({ type: 'damaged', entityId: 'e1', amount: 6, blocked: 0, sourceId: 'p' })
})

test('지원 동사의 빈 목적어는 당신이다', () => {
  const hurt = { ...P, hp: 50 }
  const r = run(materialize(put(blankSentence(2), V, card('mend')), 'e0'), [hurt, E0])
  expect(r.events).toContainEqual({ type: 'healed', entityId: 'p', amount: 6 })
})

test('적 예고 문장은 그 적 하나만 행위자로 실행된다', () => {
  const spec: ClauseSpec = {
    frameId: 'transitive',
    slots: [{ role: 'subject', head: 'spiderling' }, { role: 'object', head: 'you' }, { role: 'verb', head: 'nibble' }],
  }
  const damaged = run(enemyBoard(spec, 'e1', 2)).events.filter((e) => e.type === 'damaged')
  expect(damaged).toEqual([{ type: 'damaged', entityId: 'p', amount: 3, blocked: 0, sourceId: 'e1' }])
})

test('방어 계열 동사 판별', () => {
  expect(isDefensiveVerb('guard')).toBe(true)
  expect(isDefensiveVerb('mend')).toBe(true)
  expect(isDefensiveVerb('bite')).toBe(false)
})

test('firstAliveEnemy는 죽은 적을 건너뛴다', () => expect(firstAliveEnemy([P, { ...E0, hp: 0 }, E1])).toBe('e1'))
