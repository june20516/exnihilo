import { useEffect, useState } from 'react'

const HOTKEY = '`'

/** 글자를 입력받는 요소인지 */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  // jsdom은 isContentEditable을 구현하지 않으므로 속성도 함께 본다
  return target.isContentEditable || target.closest('[contenteditable]:not([contenteditable="false"])') !== null
}

/**
 * 백틱(`)으로 열고 닫는다. 입력창에 포커스가 있으면 무시한다.
 * initialOpen은 처음 열림 상태다(불러올 때 버린 저장값을 바로 알릴 때 쓴다).
 */
export function useTuningHotkey(
  initialOpen = false,
): [open: boolean, setOpen: (open: boolean) => void] {
  const [open, setOpen] = useState(initialOpen)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== HOTKEY || event.repeat) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTextEntry(event.target)) return
      setOpen((current) => !current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return [open, setOpen]
}
