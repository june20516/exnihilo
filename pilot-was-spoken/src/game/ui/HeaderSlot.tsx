import { type ReactNode, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { HeaderSlotContext } from './headerSlotContext'

/** 상단 바와 전투 화면을 함께 감싼다: 상단 바가 자리를 알리고, 전투 화면이 그 자리에 칩을 그린다. */
export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  return <HeaderSlotContext.Provider value={{ target, setTarget }}>{children}</HeaderSlotContext.Provider>
}

/** 상단 바(런·샌드박스)에 두는 칩 자리. 전투가 아니면 비어 있다. */
export function HeaderSlot() {
  const { setTarget } = useContext(HeaderSlotContext)
  return <div ref={setTarget} className="flex min-w-0 items-center gap-1.5" />
}

/** 상단 바의 자리에 children을 그린다(칩: 서고·망각·턴·적용 중). */
export function IntoHeader({ children }: { children: ReactNode }) {
  const { target } = useContext(HeaderSlotContext)
  return target ? createPortal(children, target) : null
}
