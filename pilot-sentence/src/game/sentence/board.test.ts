import { SPIDER_SENTENCE } from '@/game/sentence/testSentence'
import type { WordId } from '@/game/content/words'
import {
  buildBoard, getSlot, isSlotActive, placeWord, playerWordsOnBoard, revertAll, revertSlot, type PlacedWord,
} from './board'

const spiderBoard = () => buildBoard(SPIDER_SENTENCE, 2)
const S = { clause: 0, role: 'subject' } as const
const O = { clause: 0, role: 'object' } as const
const V = { clause: 0, role: 'verb' } as const
const pw = (wordId: WordId, id = 'i1'): PlacedWord => ({
  wordId, owner: 'player', instanceId: id, targetEntityId: null,
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


test('부사는 명사 슬롯에, 형용사는 동사 슬롯에 붙일 수 없다', () => {
  expect(placeWord(spiderBoard(), S, pw('fiercely'))).toEqual({ ok: false, reason: 'kindMismatch' })
  expect(placeWord(spiderBoard(), V, pw('blind'))).toEqual({ ok: false, reason: 'kindMismatch' })
})

test('형용사는 주어 수식어의 빈 위치로, 꽉 차면 modifiersFull', () => {
  const a = placeWord(spiderBoard(), S, pw('blind', 'a'))
  if (!a.ok) throw new Error('배치 실패')
  expect(getSlot(a.board, S).modifiers.map((m) => m?.wordId ?? null)).toEqual(['venomous', 'blind'])
  expect(placeWord(a.board, S, pw('blind', 'b'))).toEqual({ ok: false, reason: 'modifiersFull' })
})

test('modifierIndex를 주면 그 위치의 수식어를 교체', () => {
  const r = placeWord(spiderBoard(), S, pw('blind'), 0)
  if (!r.ok) throw new Error('배치 실패')
  expect(getSlot(r.board, S).modifiers[0]?.wordId).toBe('blind')
  expect(r.displaced.map((d) => d.wordId)).toEqual(['venomous'])
})

test('같은 슬롯을 두 번 덮으면 앞서 놓은 플레이어 단어가 displaced', () => {
  const a = placeWord(spiderBoard(), S, pw('you', 'a'))
  if (!a.ok) throw new Error('배치 실패')
  const b = placeWord(a.board, S, pw('scarecrow', 'b'))
  if (!b.ok) throw new Error('배치 실패')
  expect(b.displaced).toEqual([expect.objectContaining({ instanceId: 'a' })])
  expect(getSlot(b.board, S).originalHead.wordId).toBe('spider')
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

test('playerWordsOnBoard는 보드 위 플레이어 단어만', () => {
  const a = placeWord(spiderBoard(), S, pw('you'))
  if (!a.ok) throw new Error('배치 실패')
  expect(playerWordsOnBoard(a.board).map((w) => w.wordId)).toEqual(['you'])
})

test('수식어가 아닌 단어에 modifierIndex를 주면 kindMismatch (head를 바꾸지 않는다)', () => {
  expect(placeWord(spiderBoard(), S, pw('you'), 1)).toEqual({ ok: false, reason: 'kindMismatch' })
})

describe('동사가 문형을 결정', () => {
  test('자동사를 놓으면 목적어 슬롯이 비활성이 된다', () => {
    const r = placeWord(spiderBoard(), V, pw('rage'))
    if (!r.ok) throw new Error('배치 실패')
    expect(isSlotActive(r.board, O)).toBe(false)
    expect(isSlotActive(r.board, S)).toBe(true)
  })

  test('비활성 슬롯에 놓으면 slotInactive', () => {
    const r = placeWord(spiderBoard(), V, pw('rage'))
    if (!r.ok) throw new Error('배치 실패')
    expect(placeWord(r.board, O, pw('mark', 'x'))).toEqual({ ok: false, reason: 'slotInactive' })
  })

  test('타동사로 되돌리면 원래 목적어가 다시 활성', () => {
    const a = placeWord(spiderBoard(), V, pw('rage', 'a'))
    if (!a.ok) throw new Error('배치 실패')
    const b = placeWord(a.board, V, pw('slash', 'b'))
    if (!b.ok) throw new Error('배치 실패')
    expect(isSlotActive(b.board, O)).toBe(true)
    expect(getSlot(b.board, O).head.wordId).toBe('you')
  })
})

test('revertAll은 전부 원문으로 돌리고 밀려난 플레이어 단어를 돌려준다', () => {
  const a = placeWord(spiderBoard(), V, pw('slash'))
  if (!a.ok) throw new Error('배치 실패')
  const r = revertAll(a.board)
  expect(r.board).toEqual(spiderBoard())
  expect(r.displaced.map((d) => d.wordId)).toEqual(['slash'])
})
