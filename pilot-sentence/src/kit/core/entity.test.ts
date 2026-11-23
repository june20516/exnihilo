import { addStatus, applyDamage, createEntity, growMaxHp, heal, isAlive, loseHp, scaleIncoming, scaleOutgoing, tickEndOfTurn } from './entity'

const spider = () => createEntity({ id: 'e1', defId: 'spider', name: '거미', side: 'enemy', hp: 30 })

test('기본값: 전열, 상태 모두 0, 살아 있음', () => {
  const e = spider()
  expect(e.row).toBe('front')
  expect(e.statuses).toEqual({ block: 0, poison: 0, freeze: 0, strength: 0, weak: 0, vulnerable: 0 })
  expect(isAlive(e)).toBe(true)
})

test('보호가 피해를 먼저 흡수', () => {
  const r = applyDamage(addStatus(spider(), 'block', 4), 6)
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
  const e = addStatus(addStatus(spider(), 'poison', 3), 'block', 5)
  const r = tickEndOfTurn(e)
  expect(r.poisonDamage).toBe(3)
  expect(r.entity.hp).toBe(27)
  expect(r.entity.statuses.poison).toBe(2)
})

test('이번 턴에 얻은 보호는 첫 턴 종료 뒤에도 남고, 두 번째 턴 종료에 사라진다', () => {
  const t1 = tickEndOfTurn(addStatus(spider(), 'block', 5)).entity
  expect(t1.statuses.block).toBe(5)
  expect(tickEndOfTurn(t1).entity.statuses.block).toBe(0)
})

test('피해는 묵은 보호부터 소모한다', () => {
  const old = tickEndOfTurn(addStatus(spider(), 'block', 3)).entity
  const both = addStatus(old, 'block', 4)
  const hit = applyDamage(both, 5).entity
  expect(hit.statuses.block).toBe(2)
  expect(tickEndOfTurn(hit).entity.statuses.block).toBe(2)
})

test('연산은 원본 개체를 바꾸지 않는다', () => {
  const e = spider()
  applyDamage(e, 5)
  addStatus(e, 'poison', 2)
  expect(e.hp).toBe(30)
  expect(e.statuses.poison).toBe(0)
})

test('약화·취약은 턴 종료마다 1 줄고, 힘은 유지된다', () => {
  const e = addStatus(addStatus(addStatus(spider(), 'weak', 2), 'vulnerable', 1), 'strength', 3)
  const t = tickEndOfTurn(e).entity
  expect(t.statuses).toMatchObject({ weak: 1, vulnerable: 0, strength: 3 })
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
  const r = loseHp(addStatus(spider(), 'block', 10), 4)
  expect(r).toMatchObject({ lost: 4 })
  expect(r.entity.hp).toBe(26)
  expect(r.entity.statuses.block).toBe(10)
})

test('growMaxHp는 최대 HP와 HP를 함께 올린다', () => {
  expect(growMaxHp(spider(), 6)).toMatchObject({ hp: 36, maxHp: 36 })
})
