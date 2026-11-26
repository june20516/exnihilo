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

function renderPanel(storage: TuningStorage | null, rejected: RejectedOverride[] = []) {
  return render(
    <TuningPanel
      defs={DEFS}
      applied={APPLIED}
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

  it('숫자 입력이 범위 밖이면 저장하지 않고 경고를 보인다', () => {
    const storage = fakeStorage()
    renderPanel(storage)
    fireEvent.change(screen.getByLabelText('진행 속도 숫자'), { target: { value: '99' } })
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(screen.getByText(/0.5 ~ 3 범위/)).toBeTruthy()
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

  it('입력창에 포커스가 있으면 무시한다', () => {
    const { result } = renderHook(() => useTuningHotkey())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => void fireEvent.keyDown(input, { key: '`' }))
    expect(result.current[0]).toBe(false)
    input.remove()
  })
})
