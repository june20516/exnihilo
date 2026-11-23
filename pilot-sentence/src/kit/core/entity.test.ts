import { addStatus, applyDamage, createEntity, heal, isAlive, tickEndOfTurn } from './entity'

const spider = () => createEntity({ id: 'e1', defId: 'spider', name: '거미', side: 'enemy', hp: 30 })

test('기본값: 전열, 상태 모두 0, 살아 있음', () => {
  const e = spider()
  expect(e.row).toBe('front')
  expect(e.statuses).toEqual({ block: 0, poison: 0, freeze: 0 })
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
