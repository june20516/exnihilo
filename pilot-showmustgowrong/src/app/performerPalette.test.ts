import { describe, expect, it } from 'vitest'
import { LINEUP } from '@/content/lineup'
import { performerPalette } from './performerPalette'

describe('performerPalette', () => {
  it('무대와 대기석 출연자 모두의 id → 색, id → 짧은 이름', () => {
    const everyone = [...LINEUP.performers, ...LINEUP.bench]
    const { colors, names } = performerPalette(everyone)
    expect(Object.keys(colors)).toEqual(everyone.map((performer) => performer.id))
    for (const performer of everyone) {
      expect(colors[performer.id]).toBe(performer.color)
      expect(names[performer.id]).toBe(performer.shortName)
    }
  })
})
