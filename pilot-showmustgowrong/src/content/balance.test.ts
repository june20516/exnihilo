import { describe, expect, it } from 'vitest'
import { gaugeRiskIncrease } from './balance'

describe('gaugeRiskIncrease', () => {
  it('충격은 강도 x3만큼 폭력성을 올린다', () => {
    expect(gaugeRiskIncrease('impact', 2)).toEqual({ violence: 6 })
  })
  it('분노는 강도만큼 폭력성을 올리고 강도 3이면 언어도 10 올린다', () => {
    expect(gaugeRiskIncrease('anger', 2)).toEqual({ violence: 2 })
    expect(gaugeRiskIncrease('anger', 3)).toEqual({ violence: 3, language: 10 })
  })
  it('노출은 강도 x6만큼 선정성을 올린다', () => {
    expect(gaugeRiskIncrease('exposure', 3)).toEqual({ sexual: 18 })
  })
  it('게이지와 무관한 현상은 빈 객체다', () => {
    expect(gaugeRiskIncrease('laughter', 3)).toEqual({})
  })
})
