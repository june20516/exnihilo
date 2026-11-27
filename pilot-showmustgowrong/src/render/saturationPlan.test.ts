import { describe, expect, it } from 'vitest'
import { saturationPlan } from './saturationPlan'

const LAYERS = ['backdrop', 'floor', 'rexBody', 'moBody', 'rexOverhead', 'moOverhead'] as const

describe('saturationPlan', () => {
  it('필터가 없는 모드(평상시)면 어디에도 걸지 않는다', () => {
    expect(saturationPlan(false, LAYERS, ['rexBody'])).toEqual({ world: false, filtered: [], unfiltered: LAYERS })
  })

  it('초점 대상이 없으면 world 하나에만 건다', () => {
    expect(saturationPlan(true, LAYERS, [])).toEqual({ world: true, filtered: [], unfiltered: LAYERS })
  })

  it('초점 대상이 있으면 world에는 걸지 않고 초점 대상의 몸·머리 위 표시만 빼고 모든 레이어에 건다', () => {
    const plan = saturationPlan(true, LAYERS, ['rexBody', 'rexOverhead'])
    expect(plan.world).toBe(false)
    expect(plan.unfiltered).toEqual(['rexBody', 'rexOverhead'])
    expect(plan.filtered).toEqual(['backdrop', 'floor', 'moBody', 'moOverhead'])
  })

  it('초점 대상이 레이어에 없으면(아직 그리지 않음) world에 건다', () => {
    expect(saturationPlan(true, LAYERS, ['okaforBody']).world).toBe(true)
  })
})
