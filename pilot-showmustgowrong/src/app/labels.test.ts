import { describe, expect, it } from 'vitest'
import { BROADCAST_STEPS } from '@/content/balance'
import { TALK_SHOW } from '@/content/talkShow'
import { cameraName, formatShowClock, formatShowEnd } from './labels'

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

describe('cameraName', () => {
  it('스위처 번호와 카메라 이름을 한국어로 쓰고 영어 "CAM"을 쓰지 않는다', () => {
    const names = TALK_SHOW.cameras.map((camera) => cameraName(TALK_SHOW.cameras, camera))
    expect(names).toEqual(['카메라 1 무대 와이드', '카메라 2 클로즈업', '카메라 3 관객석'])
    for (const name of names) expect(name).not.toContain('CAM')
  })
})
