// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePinnedDismiss } from './usePinnedDismiss'

describe('usePinnedDismiss', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  function setup(active: boolean) {
    const host = document.createElement('div')
    document.body.append(host)
    const dismiss = vi.fn()
    const hostRef = { current: host }
    const hook = renderHook(
      ({ isActive, onDismiss }) => usePinnedDismiss(isActive, hostRef, onDismiss),
      { initialProps: { isActive: active, onDismiss: dismiss } },
    )
    return { host, dismiss, hook }
  }

  it('active일 때 Esc와 host 밖 클릭이 닫는다', () => {
    const { host, dismiss } = setup(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dismiss).toHaveBeenCalledTimes(1)
    fireEvent.click(document.body)
    expect(dismiss).toHaveBeenCalledTimes(2)
    fireEvent.click(host)
    expect(dismiss).toHaveBeenCalledTimes(2)
  })

  it('active가 아니면(개입 중) Esc와 밖 클릭을 카드 쪽으로 처리하지 않는다', () => {
    const { dismiss, hook } = setup(false)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(document.body)
    expect(dismiss).not.toHaveBeenCalled()
    // 개입이 시작되어 active가 꺼지면 그 뒤 Esc는 카드를 건드리지 않는다
    hook.rerender({ isActive: true, onDismiss: dismiss })
    hook.rerender({ isActive: false, onDismiss: dismiss })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('입력 칸에서 누른 Esc는 무시한다', () => {
    const { dismiss } = setup(true)
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('콜백이 바뀌어도 리스너를 다시 달지 않고 최신 콜백을 부른다', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const { hook } = setup(true)
    const calls = addSpy.mock.calls.length
    const next = vi.fn()
    hook.rerender({ isActive: true, onDismiss: next })
    expect(addSpy.mock.calls.length).toBe(calls)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(next).toHaveBeenCalledTimes(1)
    addSpy.mockRestore()
  })
})
