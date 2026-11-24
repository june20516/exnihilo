import { addBlock, addStatus, applyDamage, createEntity, expireBlock, growMaxHp, heal, isAlive, loseHp, removeAllBlock, scaleIncoming, scaleOutgoing, tickEndOfTurn } from './entity'

const spider = () => createEntity({ id: 'e1', defId: 'spider', name: '거미', side: 'enemy', hp: 30 })

test('기본값: 전열, 상태 모두 0, 살아 있음', () => {
  const e = spider()
  expect(e.row).toBe('front')
  expect(e.statuses).toEqual({ block: 0, poison: 0, freeze: 0, strength: 0, weak: 0, vulnerable: 0 })
  expect(isAlive(e)).toBe(true)
})

test('보호가 피해를 먼저 흡수', () => {
  const r = applyDamage(addBlock(spider(), 4, 0), 6)
  expect(r).toMatchObject({ dealt: 2, blocked: 4 })
  expect(r.entity.hp).toBe(28)
  expect(r.entity.statuses.block).toBe(0)
})

test('HP는 0 아래로 내려가지 않는다', () => {
  const r = applyDamage(spider(), 99)
  expect(r.entity.hp).toBe(0)
  expect(isAlive(r.entity)).toBe(false)
})

test('회복은 최대 HP를 넘지 않는다', () => {
  const hurt = applyDamage(spider(), 3).entity
  expect(heal(hurt, 10)).toMatchObject({ healed: 3 })
})

test('턴 종료: 독 피해는 보호를 무시하고 1 감소', () => {
  const e = addBlock(addStatus(spider(), 'poison', 3), 5, 0)
  const r = tickEndOfTurn(e)
  expect(r.poisonDamage).toBe(3)
  expect(r.entity.hp).toBe(27)
  expect(r.entity.statuses.poison).toBe(2)
})

test('보호 덩어리: holds 0은 다음 자기 차례 시작에 사라지고 holds 1은 한 번 더 남는다', () => {
  let e = addBlock(addBlock(spider(), 6, 0), 4, 1)
  expect(e.statuses.block).toBe(10)
  e = expireBlock(e)
  expect(e.statuses.block).toBe(4)
  expect(e.blockChunks).toEqual([{ amount: 4, turnsLeft: 0 }])
  expect(expireBlock(e).statuses.block).toBe(0)
})

test('피해는 곧 사라질 덩어리부터 깎는다', () => {
  const e = addBlock(addBlock(spider(), 4, 2), 6, 0)
  const r = applyDamage(e, 7)
  expect(r.blocked).toBe(7)
  expect(r.entity.blockChunks).toEqual([{ amount: 3, turnsLeft: 2 }])
})

test('같은 남은 턴이면 먼저 생긴 덩어리부터 깎는다', () => {
  const e = addBlock(addBlock(spider(), 3, 1), 5, 1)
  expect(applyDamage(e, 4).entity.blockChunks).toEqual([{ amount: 4, turnsLeft: 1 }])
})

test('removeAllBlock은 보호를 모두 없애고 없앤 양을 돌려준다', () => {
  const r = removeAllBlock(addBlock(addBlock(spider(), 3, 0), 5, 2))
  expect(r.removed).toBe(8)
  expect(r.entity.statuses.block).toBe(0)
  expect(r.entity.blockChunks).toEqual([])
})

test('턴 종료 처리는 보호를 건드리지 않는다', () => {
  expect(tickEndOfTurn(addBlock(spider(), 5, 0)).entity.statuses.block).toBe(5)
})

test('보호 0은 덩어리를 남기지 않는다', () => {
  expect(addBlock(spider(), 0, 2).blockChunks).toEqual([])
})

test('연산은 원본 개체를 바꾸지 않는다', () => {
  const e = spider()
  applyDamage(e, 5)
  addStatus(e, 'poison', 2)
  expect(e.hp).toBe(30)
  expect(e.statuses.poison).toBe(0)
})

test('약화·취약은 걸린 턴에는 줄지 않고, 이후 턴 종료마다 1 줄며, 힘은 유지된다', () => {
  const e = addStatus(addStatus(addStatus(spider(), 'weak', 2), 'vulnerable', 1), 'strength', 3)
  const t1 = tickEndOfTurn(e).entity
  expect(t1.statuses).toMatchObject({ weak: 2, vulnerable: 1, strength: 3 })
  const t2 = tickEndOfTurn(t1).entity
  expect(t2.statuses).toMatchObject({ weak: 1, vulnerable: 0, strength: 3 })
})

test('scaleOutgoing: 힘을 더하고 약화면 0.75배', () => {
  expect(scaleOutgoing(6, addStatus(spider(), 'strength', 2))).toBe(8)
  expect(scaleOutgoing(8, addStatus(spider(), 'weak', 1))).toBe(6)
})

test('scaleIncoming: 취약이면 1.5배', () => {
  expect(scaleIncoming(6, spider())).toBe(6)
  expect(scaleIncoming(6, addStatus(spider(), 'vulnerable', 1))).toBe(9)
})

test('loseHp는 보호를 무시하고 HP를 깎는다', () => {
  const r = loseHp(addBlock(spider(), 10, 0), 4)
  expect(r).toMatchObject({ lost: 4 })
  expect(r.entity.hp).toBe(26)
  expect(r.entity.statuses.block).toBe(10)
})

test('growMaxHp는 최대 HP와 HP를 함께 올린다', () => {
  expect(growMaxHp(spider(), 6)).toMatchObject({ hp: 36, maxHp: 36 })
})
