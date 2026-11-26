import { describe, expect, it } from 'vitest'
import { MAX_STEPS_PER_FRAME } from '@/content/balance'
import { Clock } from './clock'

describe('Clock', () => {
  it('speed 1에서 1/60초는 한 스텝이다', () => {
    const clock = new Clock()
    expect(clock.speed).toBe(1)
    expect(clock.advance(1 / 60)).toBe(1)
  })

  it('speed 0.2에서 1/60초를 다섯 번 넣으면 합이 한 스텝이다', () => {
    const clock = new Clock()
    clock.speed = 0.2
    let total = 0
    for (let i = 0; i < 5; i++) total += clock.advance(1 / 60)
    expect(total).toBe(1)
  })

  it('큰 프레임 간격은 MAX_STEPS_PER_FRAME까지만 돌고 넘친 나머지는 버린다', () => {
    const clock = new Clock()
    expect(clock.advance(10)).toBe(MAX_STEPS_PER_FRAME)
    expect(clock.advance(1 / 60)).toBe(1)
  })

  it('음수 시간이나 speed 0은 스텝을 만들지 않는다', () => {
    const clock = new Clock()
    expect(clock.advance(-1)).toBe(0)
    clock.speed = 0
    expect(clock.advance(1)).toBe(0)
  })
})
