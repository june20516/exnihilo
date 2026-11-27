import { useEffect, useEffectEvent } from 'react'
import { isTextEntry } from '@/kit/tuning'

/** 물리 키 자리. 한글 자판에서는 같은 키의 key가 'ㅣ'라 자리로도 받는다 */
const LAYOUT_HOTKEY_CODE = 'KeyL'

function isLayoutHotkey(event: KeyboardEvent): boolean {
  return event.key === 'l' || event.key === 'L' || event.code === LAYOUT_HOTKEY_CODE
}

/**
 * L 키(Shift+L 포함)로 다음 배치로 넘긴다. Ctrl·Meta·Alt와 함께 누르거나, 꾹 눌러 반복되거나,
 * 입력 칸에 포커스가 있으면 무시한다(조정 패널 단축키와 같은 규칙).
 */
export function useLayoutHotkey(onNext: () => void): void {
  const handle = useEffectEvent((event: KeyboardEvent): void => {
    if (!isLayoutHotkey(event) || event.repeat) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (isTextEntry(event.target)) return
    onNext()
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => handle(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
}
