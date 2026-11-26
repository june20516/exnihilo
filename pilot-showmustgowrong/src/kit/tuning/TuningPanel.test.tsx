// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TuningPanel } from './TuningPanel'
import type { RejectedOverride, TunableDef, TuningStorage } from './tuning'
import { useTuningHotkey } from './useTuningHotkey'

const DEFS: TunableDef[] = [
  {
    key: 'speed',
    group: '속도',
    label: '진행 속도',
    unit: '배',
    defaultValue: 1,
    min: 0.5,
    max: 3,
    step: 0.5,
    description: '방송이 흐르는 빠르기',
  },
  {
    key: 'boredom',
    group: '지루함',
    label: '지루함 증가',
    unit: '몸 초',
    defaultValue: 10,
    min: 1,
    max: 60,
    step: 1,
    description: '출연자가 지루해지는 시간',
  },
]
const APPLIED = { speed: 1, boredom: 10 }
const KEY = 'tuning-test'

interface FakeStorage extends TuningStorage {
  data: Map<string, string>
}

function fakeStorage(initial?: string): FakeStorage {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(KEY, initial)
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn((key: string) => void data.delete(key)),
  }
}

function renderPanel(
  storage: TuningStorage | null,
  rejected: RejectedOverride[] = [],
  applied: Record<string, number> = APPLIED,
) {
  return render(
    <TuningPanel
      defs={DEFS}
      applied={applied}
      rejected={rejected}
      storage={storage}
      storageKey={KEY}
      onClose={() => {}}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TuningPanel', () => {
  it('열면 묶음 이름과 항목 이름이 보인다', () => {
    renderPanel(fakeStorage())
    expect(screen.getByRole('dialog', { name: '수치 조정' })).toBeTruthy()
    expect(screen.getByText('속도')).toBeTruthy()
    expect(screen.getByText('지루함')).toBeTruthy()
    expect(screen.getByText('진행 속도')).toBeTruthy()
    expect(screen.getByText('지루함 증가')).toBeTruthy()
    expect(screen.getByText(/새로고침 뒤 새 방송부터 반영됩니다/)).toBeTruthy()
  })

  it('슬라이더를 바꾸면 바뀐 값만 저장하고 다음 방송부터를 보인다', () => {
    const storage = fakeStorage()
    renderPanel(storage)
    expect(screen.queryByText('다음 방송부터')).toBeNull()
    fireEvent.change(screen.getByLabelText('진행 속도 슬라이더'), { target: { value: '2' } })
    expect(storage.setItem).toHaveBeenCalledWith(KEY, JSON.stringify({ speed: 2 }))
    expect(screen.getByText('다음 방송부터')).toBeTruthy()
    expect(screen.getByText('바뀜')).toBeTruthy()
  })

  it('기본값으로 되돌리면 저장 키가 지워진다', () => {
    const storage = fakeStorage()
    renderPanel(storage)
    fireEvent.change(screen.getByLabelText('진행 속도 슬라이더'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '진행 속도 기본값' }))
    expect(storage.removeItem).toHaveBeenCalledWith(KEY)
    expect(storage.data.has(KEY)).toBe(false)
    expect(screen.queryByText('다음 방송부터')).toBeNull()
  })

  it('모두 기본값은 저장된 값을 전부 지운다', () => {
    const storage = fakeStorage(JSON.stringify({ speed: 2, boredom: 20 }))
    renderPanel(storage)
    fireEvent.click(screen.getByRole('button', { name: '모두 기본값' }))
    expect(storage.data.has(KEY)).toBe(false)
  })

  it('처음 열 때 저장된 바뀐 값을 편집값으로 쓰고 applied와 다르면 다음 방송부터를 보인다', () => {
    renderPanel(fakeStorage(JSON.stringify({ speed: 2 })))
    expect((screen.getByLabelText('진행 속도 숫자') as HTMLInputElement).value).toBe('2')
    expect(screen.getByText('다음 방송부터')).toBeTruthy()
  })

  it('숫자 입력이 범위 안이면 저장하고 경고가 없다', () => {
    const storage = fakeStorage()
    renderPanel(storage)
    fireEvent.change(screen.getByLabelText('지루함 증가 숫자'), { target: { value: '25' } })
    expect(storage.setItem).toHaveBeenCalledWith(KEY, JSON.stringify({ boredom: 25 }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('applied와 저장값이 다르면 열 때 저장값(다음 방송 값)이 편집값이다', () => {
    const storage = fakeStorage()
    const first = renderPanel(storage, [], { speed: 2, boredom: 10 })
    expect((screen.getByLabelText('진행 속도 숫자') as HTMLInputElement).value).toBe('1')
    expect(screen.getByText('다음 방송부터')).toBeTruthy()

    // 기본값으로 되돌린 뒤 닫고 다시 열어도 1과 다음 방송부터가 유지된다
    fireEvent.click(screen.getByRole('button', { name: '진행 속도 기본값' }))
    first.unmount()
    renderPanel(storage, [], { speed: 2, boredom: 10 })
    expect((screen.getByLabelText('진행 속도 숫자') as HTMLInputElement).value).toBe('1')
    expect(screen.getByText('다음 방송부터')).toBeTruthy()
  })

  it('저장소가 없으면 열 때부터 오류 문구를 보이고 다음 방송부터는 보이지 않는다', () => {
    renderPanel(null, [], { speed: 2, boredom: 10 })
    expect(screen.getByRole('alert').textContent).toContain('저장소를 쓸 수 없어')
    fireEvent.change(screen.getByLabelText('지루함 증가 슬라이더'), { target: { value: '20' } })
    expect(screen.getByRole('alert').textContent).toContain('저장소를 쓸 수 없어')
    expect(screen.queryByText('다음 방송부터')).toBeNull()
    expect(screen.getByText('바뀜')).toBeTruthy()
  })

  it('불러오기 오류(loadError)가 있으면 패널 위 오류로 보인다', () => {
    render(
      <TuningPanel
        defs={DEFS}
        applied={APPLIED}
        rejected={[]}
        storage={fakeStorage()}
        storageKey={KEY}
        loadError="조정값을 읽지 못했습니다: 깨진 JSON"
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe('조정값을 읽지 못했습니다: 깨진 JSON')
  })

  it('저장 오류와 복사 오류는 서로 지우지 않는다', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('거부됨'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const storage = fakeStorage()
    storage.setItem = vi.fn(() => {
      throw new Error('용량 초과')
    })
    renderPanel(storage)
    fireEvent.change(screen.getByLabelText('진행 속도 슬라이더'), { target: { value: '2' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '바뀐 값 복사' }))
    })
    const texts = screen.getAllByRole('alert').map((node) => node.textContent)
    expect(texts.some((text) => text?.includes('용량 초과'))).toBe(true)
    expect(texts.some((text) => text?.includes('거부됨'))).toBe(true)
  })

  it('저장이 실패하면 그 항목은 다음 방송부터가 아니다', () => {
    const storage = fakeStorage()
    storage.setItem = vi.fn(() => {
      throw new Error('용량 초과')
    })
    renderPanel(storage)
    fireEvent.change(screen.getByLabelText('진행 속도 슬라이더'), { target: { value: '2' } })
    expect(screen.getByText('바뀜')).toBeTruthy()
    expect(screen.queryByText('다음 방송부터')).toBeNull()
  })

  it('Esc를 누르면 닫는다', () => {
    const onClose = vi.fn()
    render(
      <TuningPanel defs={DEFS} applied={APPLIED} rejected={[]} storage={null} storageKey={KEY} onClose={onClose} />,
    )
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('숫자 입력이 범위 밖이면 저장하지 않고 경고를 보인다', () => {
    const storage = fakeStorage()
    renderPanel(storage)
    fireEvent.change(screen.getByLabelText('진행 속도 숫자'), { target: { value: '99' } })
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(screen.getByText(/0.5 ~ 3 범위/)).toBeTruthy()
    const input = screen.getByLabelText('진행 속도 숫자')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('speed-warning')
  })

  it('rejected가 있으면 개수와 키·이유를 보인다', () => {
    renderPanel(fakeStorage(), [{ key: 'speed', value: 99, reason: 'outOfRange' }])
    expect(screen.getByText('저장값 1개를 쓰지 않았습니다')).toBeTruthy()
    expect(screen.getByText(/speed/)).toBeTruthy()
  })

  it('setItem이 throw하면 오류 문구를 보인다', () => {
    const storage = fakeStorage()
    storage.setItem = vi.fn(() => {
      throw new Error('용량 초과')
    })
    renderPanel(storage)
    fireEvent.change(screen.getByLabelText('진행 속도 슬라이더'), { target: { value: '2' } })
    expect(screen.getByRole('alert').textContent).toContain('용량 초과')
  })

  it('바뀐 값 복사는 JSON을 클립보드에 쓰고, 실패하면 오류 문구를 보인다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPanel(fakeStorage(JSON.stringify({ speed: 2 })))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '바뀐 값 복사' }))
    })
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ speed: 2 }, null, 2))

    writeText.mockRejectedValueOnce(new Error('거부됨'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '바뀐 값 복사' }))
    })
    expect(screen.getByRole('alert').textContent).toContain('거부됨')
  })

  it('닫기 버튼은 onClose를 부른다', () => {
    const onClose = vi.fn()
    render(
      <TuningPanel
        defs={DEFS}
        applied={APPLIED}
        rejected={[]}
        storage={null}
        storageKey={KEY}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useTuningHotkey', () => {
  it('백틱으로 열고 다시 누르면 닫는다', () => {
    const { result } = renderHook(() => useTuningHotkey())
    expect(result.current[0]).toBe(false)
    act(() => void fireEvent.keyDown(window, { key: '`' }))
    expect(result.current[0]).toBe(true)
    act(() => void fireEvent.keyDown(window, { key: '`' }))
    expect(result.current[0]).toBe(false)
  })

  it('initialOpen이면 열린 채로 시작하고 백틱으로 닫는다', () => {
    const { result } = renderHook(() => useTuningHotkey(true))
    expect(result.current[0]).toBe(true)
    act(() => void fireEvent.keyDown(window, { key: '`' }))
    expect(result.current[0]).toBe(false)
  })

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    [
      'contentEditable',
      () => {
        const div = document.createElement('div')
        div.setAttribute('contenteditable', 'true')
        return div
      },
    ],
  ])('%s에 포커스가 있으면 무시한다', (_name, create) => {
    const { result } = renderHook(() => useTuningHotkey())
    const element = create()
    document.body.appendChild(element)
    act(() => void fireEvent.keyDown(element, { key: '`' }))
    expect(result.current[0]).toBe(false)
    element.remove()
  })

  it.each(['ctrlKey', 'metaKey', 'altKey'])('%s와 함께 누른 백틱은 무시한다', (modifier) => {
    const { result } = renderHook(() => useTuningHotkey())
    act(() => void fireEvent.keyDown(window, { key: '`', [modifier]: true }))
    expect(result.current[0]).toBe(false)
  })
})
