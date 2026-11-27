import type { Stage } from '@/sim/emotion'
import type { MoodView } from '@/sim/life'
import { EMOTION_STYLE, badgeLook, blinkVisible, emotionStyle } from './emotionBadge'
import { performerArtUrl } from './performerArt'

function mood(stage: Stage): MoodView {
  return {
    emotion: 'irritation',
    name: '짜증',
    stage,
    stageName: stage === 0 ? null : stage === 1 ? '짜증 남' : '폭발 직전',
    value: [20, 60, 90][stage],
  }
}

describe('badgeLook', () => {
  it('마음이 없거나 0단계면 작고 흐린 아이콘만 보인다', () => {
    expect(badgeLook(null)).toEqual({ size: 'faint', ring: 'none', showName: false, blink: false })
    expect(badgeLook(mood(0))).toEqual({
      size: 'faint',
      ring: 'none',
      showName: false,
      blink: false,
    })
  })

  it('1단계는 보통 크기에 반 고리와 단계 이름이다', () => {
    expect(badgeLook(mood(1))).toEqual({ size: 'normal', ring: 'half', showName: true, blink: false })
  })

  it('2단계는 크게, 꽉 찬 고리와 단계 이름, 깜박임이다', () => {
    expect(badgeLook(mood(2))).toEqual({ size: 'large', ring: 'full', showName: true, blink: true })
  })
})

describe('blinkVisible', () => {
  it('실제 0.5초 주기에서 앞 250ms만 보인다', () => {
    expect([0, 249, 250, 499, 500].map(blinkVisible)).toEqual([true, true, false, false, true])
  })
})

describe('emotionStyle', () => {
  it('여섯 감정의 색은 spec 그대로다', () => {
    expect(EMOTION_STYLE.irritation.color).toBe('#EF4444')
    expect(EMOTION_STYLE.excitement.color).toBe('#FACC15')
    expect(EMOTION_STYLE.anxiety.color).toBe('#A855F7')
    expect(EMOTION_STYLE.boredom.color).toBe('#64748B')
    expect(EMOTION_STYLE.attention.color).toBe('#EC4899')
    expect(EMOTION_STYLE.chatter.color).toBe('#38BDF8')
  })

  it('표에 없는 감정은 오류 없이 회색 물음표로 그린다', () => {
    expect(emotionStyle('unknown')).toEqual({ color: '#94A3B8', icon: '❔' })
  })
})

describe('performerArtUrl', () => {
  it('그림이 없는 출연자면 throw한다', () => {
    expect(() => performerArtUrl('nobody', 'idle')).toThrow()
  })

  it('있는 출연자와 포즈는 png 주소를 돌려준다', () => {
    expect(performerArtUrl('rex', 'fallen')).toMatch(/\.png/)
    expect(performerArtUrl('june', 'idle')).toMatch(/june\/idle\.png/)
  })
})
