import { useEffect, useState } from 'react'

const HOTKEY = '`'

/** 글자를 입력받는 요소인지 */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/** 백틱(`)으로 열고 닫는다. 입력창에 포커스가 있으면 무시한다 */
export function useTuningHotkey(): [open: boolean, setOpen: (open: boolean) => void] {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== HOTKEY || event.repeat) return
      if (isTextEntry(event.target)) return
      setOpen((current) => !current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return [open, setOpen]
}
