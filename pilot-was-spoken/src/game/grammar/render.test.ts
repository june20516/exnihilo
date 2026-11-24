import { SPIDER_SENTENCE } from '@/game/sentence/testSentence'
import { getWord } from '@/game/content/words'
import { buildBoard, placeWord, type PlacedWord } from '@/game/sentence/board'
import { renderClause } from './render'

const nameOf = (w: PlacedWord) => getWord(w.wordId).text
const board0 = () => buildBoard(SPIDER_SENTENCE, 2)

test('초기 거미 문장의 표시 토큰', () => {
  const text = renderClause(board0(), 0, nameOf).map((t) => t.text).join(' ')
  expect(text).toBe('독을 뿜는 거미 가 당신 을 물어뜯는다')
})

test('주어가 당신이면 조사가 이로 바뀐다', () => {
  const r = placeWord(board0(), { clause: 0, role: 'subject' }, {
    wordId: 'you', owner: 'player', instanceId: 'a', targetEntityId: null,
  })
  if (!r.ok) throw new Error('배치 실패')
  const tokens = renderClause(r.board, 0, nameOf)
  expect(tokens.find((t) => t.kind === 'particle')?.text).toBe('이')
})

test('조사는 표시 이름 기준이다 (지목된 적의 이름)', () => {
  const r = placeWord(board0(), { clause: 0, role: 'object' }, {
    wordId: 'mark', owner: 'player', instanceId: 'a', targetEntityId: 'e1',
  })
  if (!r.ok) throw new Error('배치 실패')
  const names = (w: PlacedWord) => (w.targetEntityId === 'e1' ? '거미' : getWord(w.wordId).text)
  const text = renderClause(r.board, 0, names).map((t) => t.text).join(' ')
  expect(text).toBe('독을 뿜는 거미 가 거미 를 물어뜯는다')
})

test('head와 수식어 토큰에는 주소가 붙는다', () => {
  const tokens = renderClause(board0(), 0, nameOf)
  expect(tokens[0]).toMatchObject({ kind: 'modifier', modifierIndex: 0, address: { clause: 0, role: 'subject' } })
  expect(tokens[1]).toMatchObject({ kind: 'head', address: { clause: 0, role: 'subject' } })
})

test('자동사 문장은 목적어와 그 조사를 표시하지 않는다', () => {
  const r = placeWord(board0(), { clause: 0, role: 'verb' }, {
    wordId: 'rage', owner: 'player', instanceId: 'a', targetEntityId: null,
  })
  if (!r.ok) throw new Error('배치 실패')
  expect(renderClause(r.board, 0, nameOf).map((t) => t.text).join(' ')).toBe('독을 뿜는 거미 가 분노한다')
})
