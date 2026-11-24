import { addBlock } from '@/kit/core/entity'
import { PLAYER_ID } from '@/game/content/characters'
import { type CardInst, type RallyState, reduceRally, startRally } from './combat'
import { sentenceCalc } from './formula'
import { sentenceFormula } from './formulaText'
import '@/game/rally/testFixtures'

const V = { clause: 0, role: 'verb' } as const

/** 플레이어 보호 8을 두고 되받아친다를 놓은 test-dummy 전투. */
function counterState(): RallyState {
  const base = startRally('test-dummy', ['bite', 'bite', 'bite', 'bite', 'bite', 'bite', 'bite', 'bite'], 1).state
  const hand: CardInst[] = [{ instanceId: 'h0', wordId: 'counter' }]
  const entities = base.entities.map((e) => (e.id === PLAYER_ID ? addBlock(e, 8, 1) : e))
  const s: RallyState = { ...base, entities, deck: { ...base.deck, hand } }
  return reduceRally(s, { type: 'place', instanceId: 'h0', at: V }).state
}

test('되받아친다 계산식의 기본값은 보호 합이고 baseLabel은 block', () => {
  const s = counterState()
  const [calc] = sentenceCalc(s)
  expect(calc).toMatchObject({ base: 8, baseLabel: 'block', value: 8 })
  const cast = reduceRally(s, { type: 'cast' })
  const hit = cast.events.find((e) => e.type === 'damaged' && e.entityId === 'e0')
  expect(hit).toMatchObject({ amount: 8 })
})

test('되받아친다 계산식 문구는 "보호 "로 시작한다', () => {
  expect(sentenceFormula(counterState())[0]?.text).toMatch(/^보호 8/)
})
