import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TALK_SHOW } from '@/content/talkShow'
import type { TrendSeries } from './trendRecorder'
import { TrendChart } from './TrendChart'

const colors = { rex: '#EF4444', mo: '#F97316' }
const names = { rex: '렉스', mo: '모' }

function render(series: TrendSeries[], axis: 'relative' | 'clock' = 'relative'): string {
  return renderToStaticMarkup(
    <TrendChart
      series={series}
      colors={colors}
      names={names}
      fromStep={0}
      toStep={3600}
      axis={axis}
      show={TALK_SHOW}
    />,
  )
}

/** 출연자 선의 d 속성 */
function pathOf(html: string, actorId: string): string | null {
  const match = new RegExp(`data-trend-line="${actorId}"[^>]*? d="([^"]*)"`).exec(html)
  return match === null ? null : match[1]
}

describe('TrendChart', () => {
  it('출연자마다 path 하나, null 점에서 선이 끊긴다', () => {
    const html = render([
      {
        actorId: 'rex',
        points: [
          { step: 0, value: 10 },
          { step: 900, value: 40 },
          { step: 1800, value: null },
          { step: 2700, value: 90 },
          { step: 3600, value: 95 },
        ],
      },
      { actorId: 'mo', points: [{ step: 0, value: 5 }] },
    ])
    expect(html.match(/<path/g)).toHaveLength(2)
    expect(pathOf(html, 'rex')?.match(/M/g)).toHaveLength(2)
    expect(html).toContain('stroke="#EF4444"')
    expect(html).toContain('stroke="#F97316"')
  })

  it('점이 하나도 없어도 축과 점선만 그리고 오류가 없다', () => {
    const html = render([{ actorId: 'rex', points: [] }])
    expect(html).not.toContain('<path')
    expect(html).toContain('1단계')
    expect(html).toContain('2단계')
    expect(html.match(/stroke-dasharray/g)).toHaveLength(2)
  })

  it('값이 하나도 없는 시리즈(무대에 오른 적 없는 대기 출연자)는 범례에서 빠진다', () => {
    const html = render([
      { actorId: 'rex', points: [{ step: 0, value: 10 }] },
      { actorId: 'mo', points: [{ step: 0, value: null }, { step: 900, value: null }] },
    ])
    expect(html).toContain('>렉스<')
    expect(html).not.toContain('>모<')
  })

  it('중간에 투입된 출연자는 앞 구간이 null이어도 값이 생겼으니 범례에 나온다', () => {
    const html = render([
      { actorId: 'rex', points: [{ step: 0, value: 10 }] },
      { actorId: 'mo', points: [{ step: 0, value: null }, { step: 900, value: 30 }] },
    ])
    expect(html).toContain('>렉스<')
    expect(html).toContain('>모<')
  })

  it('출연자가 6명이어도 범례 항목이 모두 그림 안에 있다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const html = renderToStaticMarkup(
      <TrendChart
        series={ids.map((actorId) => ({ actorId, points: [{ step: 0, value: 10 }] }))}
        colors={{}}
        names={Object.fromEntries(ids.map((id) => [id, `이름${id}`]))}
        fromStep={0}
        toStep={3600}
        axis="relative"
        show={TALK_SHOW}
      />,
    )
    const [, width, height] = (/viewBox="0 0 (\d+) (\d+)"/.exec(html) ?? []).map(Number)
    const legend = [...html.matchAll(/translate\(([\d.]+) ([\d.]+)\)/g)]
    expect(legend).toHaveLength(6)
    for (const [, x, y] of legend) {
      // 항목 폭(약 46)과 글자 높이를 감안해 오른쪽·아래 끝이 그림 안이어야 한다
      expect(Number(x) + 46).toBeLessThanOrEqual(width)
      expect(Number(y)).toBeLessThanOrEqual(height)
    }
  })

  it('범례는 짧은 이름이고 relative 축은 -60초와 지금, clock 축은 극 중 시각이다', () => {
    const relative = render([{ actorId: 'rex', points: [{ step: 0, value: 10 }] }])
    expect(relative).toContain('렉스')
    expect(relative).toContain('-60초')
    expect(relative).toContain('지금')
    expect(render([{ actorId: 'rex', points: [{ step: 0, value: 10 }] }], 'clock')).toMatch(/\d\d:\d\d/)
  })
})
