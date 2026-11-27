import { useEffect, useEffectEvent, type RefObject } from 'react'
import { isTextEntry } from '@/kit/tuning'

/**
 * 고정한 정보 카드를 닫는 입력: Esc, 스튜디오 영역(host) 밖 클릭. host 안 클릭은 스튜디오 클릭 규칙이 맡는다
 * (다른 출연자를 누르면 그 카드로 옮기고, 빈 곳을 누르면 닫는다). active가 아니면 리스너를 달지 않는다
 * (개입 중에는 호출자가 active를 끈다. 개입 중 Esc는 개입 쪽이 맡는다). 입력 칸에서 누른 Esc는 무시한다.
 * dismiss는 effect event로 읽어, 콜백이 바뀌어도 리스너를 떼었다 붙이지 않는다.
 */
export function usePinnedDismiss(
  active: boolean,
  hostRef: RefObject<HTMLElement | null>,
  dismiss: () => void,
): void {
  const onDismiss = useEffectEvent(dismiss)
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isTextEntry(event.target)) onDismiss()
    }
    const onClick = (event: MouseEvent): void => {
      const host = hostRef.current
      if (host !== null && event.target instanceof Node && host.contains(event.target)) return
      onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick)
    }
  }, [active, hostRef])
}
