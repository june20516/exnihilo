// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastView } from '@/sim/engine'
import { CameraFeedCanvas } from './CameraFeedCanvas'

const PERFORMERS = new Map(LINEUP.performers.map((performer) => [performer.id, performer]))
const CAMERA = TALK_SHOW.cameras[0]

/** 2D 컨텍스트 대역. 어떤 메서드든 부르면 기록하고, measureText는 폭을 준다. drawImage의 그림은 drawn에 모은다 */
function fakeContext(calls: string[] = [], drawn: unknown[] = []) {
  const context = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === 'measureText') return () => ({ width: 20 })
        return (...args: unknown[]) => {
          calls.push(name)
          if (name === 'drawImage') drawn.push(args[0])
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

  /** 카메라 하나를 그린 뒤 기록한 호출과 drawImage 그림 */
  function renderCamera(cameraId: string) {
    const calls: string[] = []
    const drawn: unknown[] = []
    const { context } = fakeContext(calls, drawn)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never)
    const camera = TALK_SHOW.cameras.find((candidate) => candidate.id === cameraId)
    if (camera === undefined) throw new Error(`카메라 없음: ${cameraId}`)
    render(
      <CameraFeedCanvas
        view={view}
        camera={camera}
        audienceZone={TALK_SHOW.audienceZone}
        performers={PERFORMERS}
      />,
    )
    resize(472, 265)
    return { calls, drawn }
  }

  it('배경 그림을 불러오기 전에는 단색으로 칠하고 그림 없이도 오류 없이 그린다', () => {
    // jsdom은 그림을 실제로 불러오지 않아 naturalWidth가 0이다(불러오는 중과 같다)
    for (const cameraId of ['wide', 'audienceCam']) {
      const { calls } = renderCamera(cameraId)
      expect(calls).toContain('fillRect')
      expect(calls).not.toContain('drawImage')
      cleanup()
    }
  })

  it('배경 그림을 불러왔으면 카메라 배경 종류에 맞는 그림을 가장 먼저 그린다', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1376)
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(768)
    const cases: Array<[string, string]> = [
      ['wide', 'feed-stage'],
      ['close', 'feed-stage'],
      ['audienceCam', 'feed-audience'],
    ]
    for (const [cameraId, file] of cases) {
      const { drawn } = renderCamera(cameraId)
      const first = drawn[0]
      expect(first, cameraId).toBeInstanceOf(HTMLImageElement)
      expect((first as HTMLImageElement).src, cameraId).toContain(file)
      cleanup()
    }
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

  it('view가 바뀌어도 깜박임 interval은 다시 만들지 않고 최신 view로 그리며, 깜박임이 없어지면 지운다', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const calls: string[] = []
    const { rerender } = renderFeed(withStage(2), calls)
    const feed = (feedView: BroadcastView) => (
      <CameraFeedCanvas
        view={feedView}
        camera={CAMERA}
        audienceZone={TALK_SHOW.audienceZone}
        performers={PERFORMERS}
      />
    )
    for (let step = 1; step <= 3; step++) rerender(feed({ ...withStage(2), step: view.step + step }))
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(clearIntervalSpy).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    // interval은 마지막 view를 그린다: 출연자를 한 명만 남긴 view로 바꾸면 칠하는 사각형(fillRect)이 줄어든다
    const drawnPerTick = () => {
      calls.length = 0
      act(() => {
        vi.advanceTimersByTime(100)
      })
      return calls.filter((name) => name === 'fillRect').length
    }
    const withActors = drawnPerTick()
    rerender(feed({ ...withStage(2), actors: withStage(2).actors.slice(0, 1) }))
    expect(drawnPerTick()).toBeLessThan(withActors)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    rerender(feed(withStage(0)))
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
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
