import { buildFor } from '@/game/build/build'
import { BASIC_VERB_INSTANCE, reduceRally, startRally } from '@/game/rally/combat'
import { startRun } from '@/game/run/run'
import { getSlot } from '@/game/sentence/board'
import { CHARACTERS, type CharacterDef, DEFAULT_CHARACTER } from './characters'
import '@/game/rally/testFixtures'

const V = { clause: 0, role: 'verb' } as const

test('탐험가 정의로 만든 빌드는 손패 6, 버리기 1, 기본 동사 strike다', () => {
  const build = buildFor(CHARACTERS.explorer)
  expect(build).toMatchObject({ handMax: 6, discardsPerTurn: 1, basicVerb: 'strike', slots: { subject: 2, object: 2, verb: 2 } })
  expect(CHARACTERS[DEFAULT_CHARACTER].maxHp).toBe(60)
})

test('빌드의 basicVerb를 바꾸면 기본 동사 타일이 그 단어로 놓인다', () => {
  const other: CharacterDef = { ...CHARACTERS.explorer, id: 'explorer', basicVerb: 'slash' }
  const s = startRally('test-dummy', other.starterDeck, 1, { build: buildFor(other) }).state
  const placed = reduceRally(s, { type: 'place', instanceId: BASIC_VERB_INSTANCE, at: V }).state
  expect(getSlot(placed.board, V).head.wordId).toBe('slash')
})

test('startRun은 캐릭터의 HP와 시작 덱으로 시작한다', () => {
  const run = startRun(1).state
  expect(run).toMatchObject({ hp: 60, maxHp: 60, characterId: 'explorer' })
  expect(run.deck).toEqual(CHARACTERS.explorer.starterDeck)
})
