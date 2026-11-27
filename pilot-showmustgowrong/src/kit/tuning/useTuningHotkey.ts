import { useEffect, useState } from 'react'

const HOTKEY = '`'
/** 물리 키 자리. macOS 한글 두벌식에서는 같은 키의 key가 '₩'라 자리로도 받는다 */
const HOTKEY_CODE = 'Backquote'

function isHotkey(event: KeyboardEvent): boolean {
  return event.key === HOTKEY || event.code === HOTKEY_CODE
}

/** 글자를 입력받는 요소인지(input, textarea, contenteditable). 게임 단축키도 이것으로 입력 중인 키를 거른다 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  // jsdom은 isContentEditable을 구현하지 않으므로 속성도 함께 본다
  return target.isContentEditable || target.closest('[contenteditable]:not([contenteditable="false"])') !== null
}

/**
 * 백틱(`) 키로 열고 닫는다(한글 자판에서 ₩가 찍히는 같은 자리 키도). 수정자 키와 함께 누르거나 입력창에
 * 포커스가 있으면 무시한다.
 * initialOpen은 처음 열림 상태다(불러올 때 버린 저장값을 바로 알릴 때 쓴다).
 */
export function useTuningHotkey(
  initialOpen = false,
): [open: boolean, setOpen: (open: boolean) => void] {
  const [open, setOpen] = useState(initialOpen)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!isHotkey(event) || event.repeat) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTextEntry(event.target)) return
      setOpen((current) => !current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return [open, setOpen]
}
