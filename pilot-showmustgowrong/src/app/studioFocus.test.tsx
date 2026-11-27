// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActorView } from '@/sim/engineTypes'
import { focusedActorId, liveSelectedTarget, useStudioFocus } from './studioFocus'

function actor(id: string, overrides: Partial<ActorView> = {}): ActorView {
  return { id, walkedOut: false, departed: false, ...overrides } as ActorView
}

describe('liveSelectedTarget', () => {
  const rex = { kind: 'performer', id: 'rex' } as const
  it('무대에 있는 출연자와 스태프, 미선택은 그대로 둔다', () => {
    expect(liveSelectedTarget(rex, [actor('rex')])).toEqual(rex)
    const staff = { kind: 'staff', id: 'cameraOperator' } as const
    expect(liveSelectedTarget(staff, [])).toEqual(staff)
    expect(liveSelectedTarget(null, [actor('rex')])).toBeNull()
  })
  it('이탈했거나 화면에 없는 출연자는 null이다', () => {
    expect(liveSelectedTarget(rex, [actor('rex', { walkedOut: true })])).toBeNull()
    expect(liveSelectedTarget(rex, [actor('rex', { departed: true })])).toBeNull()
    expect(liveSelectedTarget(rex, [actor('mo')])).toBeNull()
  })
})

describe('focusedActorId', () => {
  it('개입 중 출연자를 골랐을 때만 id가 나온다', () => {
    expect(focusedActorId(true, { kind: 'performer', id: 'rex' })).toBe('rex')
    expect(focusedActorId(true, { kind: 'staff', id: 'cameraOperator' })).toBeNull()
    expect(focusedActorId(true, null)).toBeNull()
    expect(focusedActorId(false, { kind: 'performer', id: 'rex' })).toBeNull()
  })
})

describe('useStudioFocus', () => {
  afterEach(cleanup)
  it('id가 바뀔 때마다 setFocus를 부르고 null로 돌아온다', () => {
    const setFocus = vi.fn()
    const ref = { current: { setFocus } }
    const hook = renderHook(({ id }) => useStudioFocus(ref, id), { initialProps: { id: null as string | null } })
    expect(setFocus).toHaveBeenLastCalledWith(null)
    hook.rerender({ id: 'rex' })
    expect(setFocus).toHaveBeenLastCalledWith('rex')
    hook.rerender({ id: null })
    expect(setFocus).toHaveBeenLastCalledWith(null)
  })
})
