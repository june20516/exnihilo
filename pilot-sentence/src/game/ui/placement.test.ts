import { dropId, parseDropId } from './placement'

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
