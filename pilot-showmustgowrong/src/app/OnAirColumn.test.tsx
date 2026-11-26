// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastView } from '@/sim/engine'
import { OnAirColumn } from './OnAirColumn'
import { SWITCHER_KEYS } from './labels'

const PERFORMERS = new Map(LINEUP.performers.map((performer) => [performer.id, performer]))
const CAMERA_IDS = TALK_SHOW.cameras.map((camera) => camera.id)

describe('OnAirColumn 카메라 칸', () => {
  let baseView: BroadcastView

  beforeAll(async () => {
    // 캔버스 2D 컨텍스트가 없는 jsdom에서도 그리기를 건너뛰게 한다.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    const broadcast = await Broadcast.create({ show: TALK_SHOW, ...LINEUP, seed: 1 })
    baseView = broadcast.view()
    broadcast.dispose()
  })

  afterEach(cleanup)

  function renderColumn(
    onAirCameraId: string,
    handlers: { onSwitch?: (id: string) => void; onAimDragStart?: (id: string) => void } = {},
  ) {
    return render(
      <OnAirColumn
        view={{ ...baseView, onAirCameraId }}
        show={TALK_SHOW}
        performers={PERFORMERS}
        onSwitch={handlers.onSwitch ?? vi.fn()}
        onAimDragStart={handlers.onAimDragStart}
        actions={null}
        overlay={null}
      />,
    )
  }

  const slotOrder = () =>
    CAMERA_IDS.map((id) => screen.getByTestId(`switcher-slot-${id}`)).sort(
      (a, b) => Number(a.dataset.slotIndex) - Number(b.dataset.slotIndex),
    )

  it('송출 카메라가 바뀌어도 칸 순서는 show.cameras 순서 그대로다', () => {
    for (const onAirCameraId of ['wide', 'close', 'audienceCam']) {
      renderColumn(onAirCameraId)
      const slots = Array.from(screen.getByTestId('switcher-slots').children)
      expect(slots.map((slot) => slot.getAttribute('data-testid'))).toEqual(
        CAMERA_IDS.map((id) => `switcher-slot-${id}`),
      )
      expect(slotOrder().map((slot) => slot.dataset.slotIndex)).toEqual(['0', '1', '2'])
      expect(screen.getByTestId('program-monitor').dataset.onAir).toBe('true')
      cleanup()
    }
  })

  it('송출 중인 칸만 data-on-air가 true이고, 누르면 전환하지 않는다', () => {
    const onSwitch = vi.fn()
    renderColumn('close', { onSwitch })
    expect(slotOrder().map((slot) => slot.dataset.onAir)).toEqual(['false', 'true', 'false'])
    fireEvent.click(screen.getByTestId('switcher-slot-close'))
    expect(onSwitch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('switcher-slot-audienceCam'))
    expect(onSwitch).toHaveBeenCalledWith('audienceCam')
  })

  it('추적 카메라 칸은 송출 중이든 아니든 누르면 끌기를 시작한다', () => {
    for (const onAirCameraId of ['wide', 'close']) {
      const onAimDragStart = vi.fn()
      renderColumn(onAirCameraId, { onAimDragStart })
      fireEvent.pointerDown(screen.getByTestId('switcher-slot-close'))
      expect(onAimDragStart).toHaveBeenCalledWith('close', expect.anything())
      cleanup()
    }
  })

  it('칸 아래 키 표시가 1·2·3 순서와 같다', () => {
    renderColumn('wide')
    const keys = slotOrder().map((slot) => slot.querySelector('kbd')?.textContent)
    expect(keys).toEqual([...SWITCHER_KEYS])
  })
})
