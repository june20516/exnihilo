import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TALK_SHOW } from '@/content/talkShow'
import type { LogLine } from '@/sim/engine'
import { EventLog } from './Hud'
import { logIndent } from './logFormat'

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
    actorId: null,
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  }
}

function render(log: LogLine[], highlightedEventId: number | null = null): string {
  return renderToStaticMarkup(
    <EventLog log={log} highlightedEventId={highlightedEventId} show={TALK_SHOW} />,
  )
}

/** data-log-index가 index인 줄 하나의 마크업 */
function rowOf(html: string, index: number): string {
  const match = new RegExp(`<li data-log-index="${index}".*?</li>`).exec(html)
  if (match === null) throw new Error(`줄 ${index}이 없습니다`)
  return match[0]
}

describe('logIndent', () => {
  it('깊이 0과 1은 들여쓰지 않고, 깊이마다 12px씩 늘다 4단계에서 멈춘다', () => {
    expect(logIndent(0)).toBe(0)
    expect(logIndent(1)).toBe(0)
    expect(logIndent(2)).toBe(12)
    expect(logIndent(4)).toBe(36)
    expect(logIndent(9)).toBe(36)
  })
})

describe('EventLog 줄 종류', () => {
  const html = render([
    line({ index: 0, kind: 'habit', text: '렉스가 코를 판다' }),
    line({ index: 1, kind: 'stage', emotion: 'irritation', text: '오카포가 슬슬 짜증이 난다' }),
    line({ index: 2, kind: 'stage', emotion: 'excitement', text: '모가 들썩이기 시작한다' }),
    line({ index: 3, kind: 'stage', emotion: 'anxiety', text: '준이 불안한 눈치다' }),
    line({ index: 4, kind: 'stage', emotion: 'boredom', text: '프리야가 지루한 기색이다' }),
    line({ index: 5, kind: 'stage', emotion: 'attention', text: '렉스가 카메라를 힐끔거린다' }),
    line({ index: 6, kind: 'incident', text: '모가 렉스에게 달려든다' }),
    line({ index: 7, kind: 'staff', text: '카메라 감독이 놀란다' }),
    line({ index: 8, kind: 'silence', text: '정적이 흐른다' }),
  ])

  it('버릇 줄은 이탤릭 slate-500이라 사건·감정 줄보다 낮은 단계로 읽힌다', () => {
    expect(rowOf(html, 0)).toContain('italic')
    expect(rowOf(html, 0)).toContain('text-slate-500')
    expect(rowOf(html, 4)).not.toContain('italic')
  })

  it('단계 줄은 감정 색(inline)과 감정 아이콘이고 개인 감정도 같은 표를 쓴다', () => {
    expect(rowOf(html, 1)).toContain('color:#EF4444')
    expect(rowOf(html, 1)).toContain('😠')
    expect(rowOf(html, 2)).toContain('color:#FACC15')
    expect(rowOf(html, 3)).toContain('color:#A855F7')
    expect(rowOf(html, 4)).toContain('color:#64748B')
    expect(rowOf(html, 5)).toContain('color:#EC4899')
    expect(rowOf(html, 5)).toContain('📷')
  })

  it('2단계 진입 줄만 굵게 하고 1단계 진입 줄은 굵게 하지 않는다', () => {
    const stages = render([
      line({ index: 0, kind: 'stage', emotion: 'irritation', stage: 1, text: '슬슬 짜증이 난다' }),
      line({ index: 1, kind: 'stage', emotion: 'irritation', stage: 2, text: '폭발 직전이다' }),
    ])
    expect(rowOf(stages, 0)).not.toContain('font-bold')
    expect(rowOf(stages, 1)).toContain('font-bold')
  })

  it('사건 줄은 흰 굵은 글과 3단 표식이고, 스태프·정적·버릇은 흐린 1단이다', () => {
    expect(rowOf(html, 6)).toContain('font-bold text-white')
    expect(rowOf(html, 6)).toContain('data-log-tier="3"')
    for (const index of [0, 7, 8]) {
      expect(rowOf(html, index)).toContain('data-log-tier="1"')
      expect(rowOf(html, index)).toContain('italic')
      expect(rowOf(html, index)).not.toContain('font-bold')
    }
    expect(rowOf(html, 8)).toContain('text-[#7C8DA6]')
  })

  it('사고 줄의 왼쪽 띠는 줄 주인공(actorId)의 색이고, 이름은 출연자 색으로 칠한다', () => {
    const people = [
      { name: '렉스', color: '#EF4444' },
      { name: '모', color: '#F97316' },
    ]
    const actorColors = { rex: '#EF4444', mo: '#F97316' }
    const colored = renderToStaticMarkup(
      <EventLog
        log={[
          line({ index: 0, text: '모가 렉스에게 달려든다', actorId: 'mo' }),
          // 글에 먼저 나오는 이름(모)이 아니라 엔진이 아는 주인공(렉스)을 쓴다
          line({ index: 1, text: '모 옆에서 렉스가 넘어진다', actorId: 'rex' }),
          // 주인공이 출연자가 아니면(장비 등) 이름이 있어도 기본 띠 색
          line({ index: 2, text: '조명이 렉스 위로 떨어진다', actorId: null }),
        ]}
        highlightedEventId={null}
        show={TALK_SHOW}
        people={people}
        actorColors={actorColors}
      />,
    )
    expect(rowOf(colored, 0)).toContain('border-left-color:#F97316')
    expect(rowOf(colored, 0)).toContain('<span style="color:#F97316">모</span>')
    expect(rowOf(colored, 0)).toContain('<span style="color:#EF4444">렉스</span>')
    expect(rowOf(colored, 1)).toContain('border-left-color:#EF4444')
    expect(rowOf(colored, 2)).toContain('border-left-color:#e2e8f0')
  })

  it('이어받은 줄의 앞머리는 흐리게 칠한다', () => {
    const led = renderToStaticMarkup(
      <EventLog
        log={[line({ index: 0, text: '프리야의 킥킥거림에 이어 모가 웃는다', leadIn: '프리야의 킥킥거림에 이어 ' })]}
        highlightedEventId={null}
        show={TALK_SHOW}
        people={[{ name: '프리야', color: '#A855F7' }]}
      />,
    )
    expect(rowOf(led, 0)).toContain('opacity:0.5')
  })

  it('긴 줄은 자르지 않고 줄바꿈한다', () => {
    expect(html).not.toContain('truncate')
    expect(html).toContain('break-keep')
  })
})

describe('EventLog 묶음과 들여쓰기', () => {
  it('repeat가 2 이상이면 ×N을 붙이고 1이면 붙이지 않는다', () => {
    const html = render([
      line({ index: 0, text: '소리가 난다', repeat: 3 }),
      line({ index: 1, text: '조용하다', repeat: 1 }),
    ])
    expect(rowOf(html, 0)).toContain('×3')
    expect(rowOf(html, 1)).not.toContain('×')
  })

  it('깊이 0 줄은 음수 들여쓰기 없이 0px이다', () => {
    const html = render([line({ index: 0, depth: 0 })])
    expect(rowOf(html, 0)).toContain('padding-left:0px')
    expect(html).not.toContain('padding-left:-')
  })

  it('묶인 줄은 첫 사건부터 마지막 사건 사이의 id로 강조된다', () => {
    const log = [line({ index: 0, eventId: 10, lastEventId: 14, repeat: 3 }), line({ index: 1, eventId: 20, lastEventId: 20 })]
    expect(rowOf(render(log, 14), 0)).toContain('bg-amber-500/30')
    expect(rowOf(render(log, 10), 0)).toContain('bg-amber-500/30')
    expect(rowOf(render(log, 14), 1)).not.toContain('bg-amber-500/30')
    expect(rowOf(render(log, 9), 0)).not.toContain('bg-amber-500/30')
  })
})
