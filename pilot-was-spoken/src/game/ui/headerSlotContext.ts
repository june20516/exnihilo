import { createContext } from 'react'

/** 상단 바의 칩 자리(요소)와 그 자리를 알리는 ref 콜백. */
export interface HeaderSlotValue {
  readonly target: HTMLElement | null
  readonly setTarget: (element: HTMLElement | null) => void
}

export const HeaderSlotContext = createContext<HeaderSlotValue>({ target: null, setTarget: () => {} })
