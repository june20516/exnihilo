// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastView } from '@/sim/engine'
import { CameraFeedCanvas } from './CameraFeedCanvas'

const PERFORMERS = new Map(LINEUP.performers.map((performer) => [performer.id, performer]))
const CAMERA = TALK_SHOW.cameras[0]

/** 2D 컨텍스트 대역. 어떤 메서드든 부르면 기록하고, measureText는 폭을 준다 */
function fakeContext(calls: string[] = []) {
  const context = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === 'measureText') return () => ({ width: 20 })
        return (..._args: unknown[]) => {
          calls.push(name)
        }
      },
      set: () => true,
    },
  )
  return { context, calls }
}

describe('CameraFeedCanvas', () => {
  let view: BroadcastView
  let resize: (width: number, height: number) => void
  let size = { width: 0, height: 0 }

  beforeAll(async () => {
    const broadcast = await Broadcast.create({
      show: TALK_SHOW,
      ...LINEUP,
      seed: 1,
    })
    view = broadcast.view()
    broadcast.dispose()
  })

  beforeEach(() => {
    size = { width: 0, height: 0 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      ...size,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    }))
    let notify: () => void = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    resize = (width, height) => {
      size = { width, height }
      act(() => notify())
    }
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** 화면에 보이는 출연자 전부의 대표 감정을 주어진 단계로 바꾼 view */
  function withStage(stage: 0 | 2): BroadcastView {
    return {
      ...view,
      actors: view.actors.map((actor) => ({
        ...actor,
        mood: { emotion: 'irritation', name: '짜증', stage, stageName: '폭발 직전', value: 0.9 },
      })),
    }
  }

  function renderFeed(feedView: BroadcastView, calls: string[]) {
    const { context } = fakeContext(calls)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never)
    size = { width: 264, height: 149 }
    const result = render(
      <CameraFeedCanvas
        view={feedView}
        camera={CAMERA}
        audienceZone={TALK_SHOW.audienceZone}
        performers={PERFORMERS}
      />,
    )
    return result
  }

  it('부모 크기가 0이면 그리지 않고, 크기가 정해지면 같은 캔버스에 다시 그린다', () => {
    const { context, calls } = fakeContext()
    // getContext 오버로드 때문에 대역은 never로 맞춘다
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never)
    render(
      <CameraFeedCanvas
        view={view}
        camera={CAMERA}
        audienceZone={TALK_SHOW.audienceZone}
        performers={PERFORMERS}
      />,
    )
    const canvas = screen.getByRole('img')
    expect(calls).not.toContain('clearRect')

    resize(264, 149)
    expect(calls).toContain('clearRect')
    expect(screen.getByRole('img')).toBe(canvas)
    expect(canvas.style.width).toBe('264px')

    calls.length = 0
    resize(84, 47)
    expect(calls).toContain('clearRect')
    expect(screen.getByRole('img')).toBe(canvas)
    expect(canvas.style.width).toBe('84px')
  })

  it('2단계 출연자가 있으면 시간이 흐를 때 다시 그리고, 언마운트하면 interval을 정리한다', () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const { unmount } = renderFeed(withStage(2), calls)
    const drawsOf = () => calls.filter((name) => name === 'clearRect').length
    const first = drawsOf()
    expect(first).toBeGreaterThan(0)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(drawsOf()).toBeGreaterThan(first)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
    const afterUnmount = drawsOf()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(drawsOf()).toBe(afterUnmount)
  })

  it('2단계가 없으면 주기적으로 다시 그리지 않는다', () => {
    vi.useFakeTimers()
    const calls: string[] = []
    renderFeed(withStage(0), calls)
    const draws = calls.filter((name) => name === 'clearRect').length
    expect(draws).toBeGreaterThan(0)
    expect(vi.getTimerCount()).toBe(0)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(calls.filter((name) => name === 'clearRect').length).toBe(draws)
  })

  it('2단계 고리 깜박임은 실제 시간(performance.now)이 정하고 시뮬레이션 상태와 무관하다', () => {
    vi.useFakeTimers()
    const now = vi.spyOn(performance, 'now')
    const calls: string[] = []
    // 바닥 선 stroke 한 번 + 보이는 동안 2단계 고리 stroke
    const strokesOfNextDraw = (realMs: number) => {
      now.mockReturnValue(realMs)
      calls.length = 0
      act(() => {
        vi.advanceTimersByTime(100)
      })
      return calls.filter((name) => name === 'stroke').length
    }
    now.mockReturnValue(0)
    const { rerender } = renderFeed(withStage(2), calls)
    const visible = strokesOfNextDraw(0)
    const hidden = strokesOfNextDraw(250)
    expect(visible).toBeGreaterThan(hidden)
    // 0.5초 뒤 같은 위상은 같은 결과
    expect(strokesOfNextDraw(500)).toBe(visible)

    // 시뮬레이션 단계와 자동 슬로모션 값만 다른 view로 바꿔도 같은 실제 시간이면 같은 결과
    const otherSim: BroadcastView = {
      ...withStage(2),
      step: view.step + 100,
      autoSlowmo: { gauge: null, eventId: 1, step: view.step + 100 },
    }
    rerender(
      <CameraFeedCanvas
        view={otherSim}
        camera={CAMERA}
        audienceZone={TALK_SHOW.audienceZone}
        performers={PERFORMERS}
      />,
    )
    expect(strokesOfNextDraw(0)).toBe(visible)
    expect(strokesOfNextDraw(250)).toBe(hidden)
  })
})
