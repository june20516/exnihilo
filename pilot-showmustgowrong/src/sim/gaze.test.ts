import { describe, expect, it } from 'vitest'
import { STEP_SECONDS } from '@/content/balance'
import { absentPeriodSteps } from './gaze'

describe('absentPeriodSteps', () => {
  it('초를 스텝으로 환산하고 최소 1스텝이다', () => {
    const stepsPerSecond = Math.round(1 / STEP_SECONDS)
    const absentFor = (seconds: number) => ({ kind: 'gaze', when: 'absentFor', seconds }) as const
    expect(absentPeriodSteps(absentFor(5))).toBe(5 * stepsPerSecond)
    expect(absentPeriodSteps(absentFor(0))).toBe(1)
  })
})
