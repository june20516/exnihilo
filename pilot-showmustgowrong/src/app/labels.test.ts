import { describe, expect, it } from 'vitest'
import { BROADCAST_STEPS } from '@/content/balance'
import { TALK_SHOW } from '@/content/talkShow'
import { formatShowClock, formatShowEnd } from './labels'

describe('극 중 시각 표기', () => {
  it('스텝을 극 중 시각 "HH:MM"으로 쓴다(분 내림)', () => {
    expect(formatShowClock(0, TALK_SHOW)).toBe('21:00')
    expect(formatShowClock(3600, TALK_SHOW)).toBe('21:10')
    expect(formatShowClock(BROADCAST_STEPS, TALK_SHOW)).toBe('21:30')
  })

  it('분 경계 직전(스텝 359)은 21:00, 경계(스텝 360)는 21:01이다', () => {
    expect(formatShowClock(359, TALK_SHOW)).toBe('21:00')
    expect(formatShowClock(360, TALK_SHOW)).toBe('21:01')
  })

  it('방송 종료 시각을 쓴다', () => {
    expect(formatShowEnd(TALK_SHOW)).toBe('21:30')
  })

  it('자정을 넘기면 24로 나눈 나머지를 쓴다', () => {
    const late = { ...TALK_SHOW, startTime: { hour: 23, minute: 50 } }
    expect(formatShowEnd(late)).toBe('00:20')
    expect(formatShowClock(BROADCAST_STEPS, late)).toBe('00:20')
  })
})
