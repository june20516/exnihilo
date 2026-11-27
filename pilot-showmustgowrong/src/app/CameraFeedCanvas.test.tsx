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
function fakeContext() {
  const calls: string[] = []
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
  const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')

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
    rectSpy.mockImplementation(() => ({
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
    vi.unstubAllGlobals()
  })

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
})
