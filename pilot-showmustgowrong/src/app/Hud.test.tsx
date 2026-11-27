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

  it('긴 줄은 자르지 않고 줄바꿈한다', () => {
    expect(html).not.toContain('truncate')
    expect(html).toContain('break-keep')
  })

  it('단계 줄은 감정별 색이고 개인 감정은 violet-300이다', () => {
    expect(rowOf(html, 1)).toContain('text-red-300')
    expect(rowOf(html, 2)).toContain('text-amber-300')
    expect(rowOf(html, 3)).toContain('text-sky-300')
    expect(rowOf(html, 4)).toContain('text-slate-400')
    expect(rowOf(html, 5)).toContain('text-violet-300')
  })

  it('사건 줄만 굵게 하고, 스태프·정적 줄은 색을 따로 주지 않는다', () => {
    expect(rowOf(html, 6)).toContain('font-semibold')
    for (const index of [0, 1, 7, 8]) expect(rowOf(html, index)).not.toContain('font-semibold')
    for (const index of [7, 8]) expect(rowOf(html, index)).not.toMatch(/text-(red|amber|sky|violet)-300/)
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
