import { describe, expect, it } from 'vitest'
import type { LogLine } from '@/sim/engine'
import { logTier } from './logFormat'
import { logSegments } from './logSegments'

function line(overrides: Partial<LogLine>): LogLine {
  return {
    index: 0,
    step: 0,
    text: '문장',
    kind: 'incident',
    emotion: null,
    stage: null,
    repeat: 1,
    depth: 1,
    eventId: null,
    lastEventId: null,
    leadIn: null,
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  }
}

const people = [
  { name: '렉스 캘러웨이', color: '#EF4444' },
  { name: '렉스', color: '#EF4444' },
  { name: '프리야', color: '#A855F7' },
  { name: '오카포', color: '#14B8A6' },
  { name: '모', color: '#F97316' },
]

describe('logTier', () => {
  it('사고는 3단, 감정 단계 진입은 2단, 나머지는 1단이다', () => {
    expect(logTier(line({ kind: 'incident' }))).toBe(3)
    expect(logTier(line({ kind: 'stage' }))).toBe(2)
    for (const kind of ['habit', 'staff', 'silence'] as const) expect(logTier(line({ kind }))).toBe(1)
  })
})

describe('logSegments', () => {
  it('이어받은 줄은 앞머리를 흐리게 하고 이름을 출연자 색으로 나눈다', () => {
    const takeover = line({
      text: '프리야의 킥킥거림에 이어 오카포가 렉스에게 버럭한다',
      leadIn: '프리야의 킥킥거림에 이어 ',
    })
    expect(logSegments(takeover, people)).toEqual([
      { text: '프리야', color: '#A855F7', dim: true },
      { text: '의 킥킥거림에 이어 ', color: null, dim: true },
      { text: '오카포', color: '#14B8A6', dim: false },
      { text: '가 ', color: null, dim: false },
      { text: '렉스', color: '#EF4444', dim: false },
      { text: '에게 버럭한다', color: null, dim: false },
    ])
  })

  it('정식 이름과 짧은 이름 중 긴 이름이 먼저 잡힌다', () => {
    expect(logSegments(line({ text: '렉스 캘러웨이가 웃는다' }), people)).toEqual([
      { text: '렉스 캘러웨이', color: '#EF4444', dim: false },
      { text: '가 웃는다', color: null, dim: false },
    ])
  })

  it('한 글자 이름은 낱말 속("모습", "모두")이 아니라 조사가 붙은 이름일 때만 잡힌다', () => {
    expect(logSegments(line({ text: '모두 모습을 본다' }), people)).toEqual([
      { text: '모두 모습을 본다', color: null, dim: false },
    ])
    expect(logSegments(line({ text: '모가 달려든다' }), people)).toEqual([
      { text: '모', color: '#F97316', dim: false },
      { text: '가 달려든다', color: null, dim: false },
    ])
  })

  it('이름이 없거나 사람 목록이 비어도 줄 전체가 한 조각이다', () => {
    expect(logSegments(line({ text: '정적이 흐른다' }), [])).toEqual([
      { text: '정적이 흐른다', color: null, dim: false },
    ])
  })
})
