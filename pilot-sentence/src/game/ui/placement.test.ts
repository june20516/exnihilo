import { ENCOUNTERS } from '@/game/content/encounters'
import { buildBoard } from '@/game/sentence/board'
import { canPlayAnywhere, dropId, parseDropId } from './placement'

test('dropId와 parseDropId는 서로 역함수', () => {
  const head = { clause: 0, role: 'subject' } as const
  expect(dropId(head, null)).toBe('0:subject:head')
  expect(parseDropId('0:subject:head')).toEqual({ at: head })
  expect(parseDropId(dropId({ clause: 0, role: 'verb' }, 1))).toEqual({ at: { clause: 0, role: 'verb' }, modifierIndex: 1 })
})

test('알 수 없는 드롭 id는 null', () => {
  expect(parseDropId('0:nope:head')).toBeNull()
  expect(parseDropId('garbage')).toBeNull()
})

test('canPlayAnywhere: 현재 문장 어디에도 놓을 수 없는 단어를 가려낸다', () => {
  const board = buildBoard(ENCOUNTERS.spider.initialSentence, 2)
  expect(canPlayAnywhere(board, 'sleep')).toBe(false)
  expect(canPlayAnywhere(board, 'web')).toBe(false)
  expect(canPlayAnywhere(board, 'bite')).toBe(true)
  expect(canPlayAnywhere(board, 'blind')).toBe(true)
  expect(canPlayAnywhere(board, 'you')).toBe(true)
})
