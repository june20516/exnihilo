import { ENCOUNTERS } from '@/game/content/encounters'
import type { WordId } from '@/game/content/words'
import {
  buildBoard, dryInk, enemyAttach, enemyReplace, getSlot, placeWord, playerWordsOnBoard, revertSlot, sealSlot,
  type PlacedWord,
} from './board'

const spiderBoard = () => buildBoard(ENCOUNTERS.spider.initialSentence, 2)
const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
const pw = (wordId: WordId, ink = 2, id = 'i1'): PlacedWord => ({
  wordId, owner: 'player', inkLeft: ink, instanceId: id, targetEntityId: null,
})
const ew = (wordId: WordId): PlacedWord => ({
  wordId, owner: 'enemy', inkLeft: null, instanceId: null, targetEntityId: null,
})

test('초기 보드: 원문이 현재값으로 복사되고 수식어 칸은 maxModifiers 길이', () => {
  const slot = getSlot(spiderBoard(), S)
  expect(slot.head.wordId).toBe('spider')
  expect(slot.modifiers.map((m) => m?.wordId ?? null)).toEqual(['venomous', null])
  expect(getSlot(spiderBoard(), O).modifiers).toEqual([null, null])
})

test('주어에 당신을 놓으면 거미가 밀려나고 원문은 유지', () => {
  const r = placeWord(spiderBoard(), S, pw('you'))
  if (!r.ok) throw new Error('배치 실패')
  expect(getSlot(r.board, S).head.wordId).toBe('you')
  expect(getSlot(r.board, S).originalHead.wordId).toBe('spider')
  expect(r.displaced.map((d) => d.wordId)).toEqual(['spider'])
})

test('동사 슬롯에 명사를 놓으면 kindMismatch', () => {
  expect(placeWord(spiderBoard(), V, pw('you'))).toEqual({ ok: false, reason: 'kindMismatch' })
})

test('자동사는 타동 문형 동사 슬롯에 놓을 수 없다', () => {
  expect(placeWord(spiderBoard(), V, pw('sleep'))).toEqual({ ok: false, reason: 'kindMismatch' })
})

test('부사는 명사 슬롯에, 형용사는 동사 슬롯에 붙일 수 없다', () => {
  expect(placeWord(spiderBoard(), S, pw('fiercely'))).toEqual({ ok: false, reason: 'kindMismatch' })
  expect(placeWord(spiderBoard(), V, pw('blind'))).toEqual({ ok: false, reason: 'kindMismatch' })
})

test('형용사는 주어 수식어의 빈 위치로, 꽉 차면 modifiersFull', () => {
  const a = placeWord(spiderBoard(), S, pw('blind', 2, 'a'))
  if (!a.ok) throw new Error('배치 실패')
  expect(getSlot(a.board, S).modifiers.map((m) => m?.wordId ?? null)).toEqual(['venomous', 'blind'])
  expect(placeWord(a.board, S, pw('blind', 2, 'b'))).toEqual({ ok: false, reason: 'modifiersFull' })
})

test('modifierIndex를 주면 그 위치의 수식어를 교체', () => {
  const r = placeWord(spiderBoard(), S, pw('blind'), 0)
  if (!r.ok) throw new Error('배치 실패')
  expect(getSlot(r.board, S).modifiers[0]?.wordId).toBe('blind')
  expect(r.displaced.map((d) => d.wordId)).toEqual(['venomous'])
})

test('같은 슬롯을 두 번 덮으면 앞서 놓은 플레이어 단어가 displaced', () => {
  const a = placeWord(spiderBoard(), S, pw('you', 2, 'a'))
  if (!a.ok) throw new Error('배치 실패')
  const b = placeWord(a.board, S, pw('scarecrow', 2, 'b'))
  if (!b.ok) throw new Error('배치 실패')
  expect(b.displaced).toEqual([expect.objectContaining({ instanceId: 'a' })])
  expect(getSlot(b.board, S).originalHead.wordId).toBe('spider')
})

test('잉크 2인 단어는 두 번째 건조 때 원문으로 복귀', () => {
  const a = placeWord(spiderBoard(), S, pw('you'))
  if (!a.ok) throw new Error('배치 실패')
  const d1 = dryInk(a.board)
  expect(getSlot(d1.board, S).head.wordId).toBe('you')
  expect(d1.dried).toHaveLength(0)
  const d2 = dryInk(d1.board)
  expect(getSlot(d2.board, S).head.wordId).toBe('spider')
  expect(d2.dried[0]).toMatchObject({ at: S, modifierIndex: null, word: { wordId: 'you' } })
})

test('건조된 수식어는 원문 수식어(없으면 빈칸)로 돌아간다', () => {
  const a = placeWord(spiderBoard(), S, pw('blind', 1))
  if (!a.ok) throw new Error('배치 실패')
  const d = dryInk(a.board)
  expect(getSlot(d.board, S).modifiers.map((m) => m?.wordId ?? null)).toEqual(['venomous', null])
  expect(d.dried[0].modifierIndex).toBe(1)
})

test('이미 원문인 슬롯을 revert해도 변화 없음', () => {
  const b = spiderBoard()
  const r = revertSlot(b, S)
  expect(r.board).toEqual(b)
  expect(r.displaced).toEqual([])
})

test('revert는 플레이어 단어를 displaced로 돌려준다', () => {
  const a = placeWord(spiderBoard(), S, pw('you'))
  if (!a.ok) throw new Error('배치 실패')
  expect(revertSlot(a.board, S).displaced.map((d) => d.wordId)).toEqual(['you'])
})

test('적 attach는 원문도 바꿔서 건조 후에도 남는다', () => {
  const r = enemyAttach(spiderBoard(), V, ew('fiercely'))
  expect(getSlot(r.board, V).modifiers[0]?.wordId).toBe('fiercely')
  expect(getSlot(r.board, V).originalModifiers[0]?.wordId).toBe('fiercely')
})

test('적 attach는 빈칸이 없으면 맨 왼쪽을 덮는다', () => {
  const full = enemyAttach(enemyAttach(spiderBoard(), V, ew('fiercely')).board, V, ew('fiercely')).board
  const r = enemyAttach(full, V, ew('fiercely'))
  expect(r.displaced).toHaveLength(1)
})

test('적 replace는 head와 원문을 모두 바꾼다', () => {
  const r = enemyReplace(spiderBoard(), O, ew('spider'))
  expect(getSlot(r.board, O).head.wordId).toBe('spider')
  expect(getSlot(r.board, O).originalHead.wordId).toBe('spider')
})

test('봉인된 슬롯에도 적 개입은 적용된다', () => {
  const sealed = sealSlot(spiderBoard(), S)
  expect(getSlot(sealed, S).sealed).toBe(true)
  const a = placeWord(sealed, S, pw('you'))
  if (!a.ok) throw new Error('배치 실패')
  expect(getSlot(revertSlot(a.board, S).board, S).head.wordId).toBe('spider')
})

test('playerWordsOnBoard는 보드 위 플레이어 단어만', () => {
  const a = placeWord(spiderBoard(), S, pw('you'))
  if (!a.ok) throw new Error('배치 실패')
  expect(playerWordsOnBoard(a.board).map((w) => w.wordId)).toEqual(['you'])
})
