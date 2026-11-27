import { useLayoutEffect, useRef, useState } from 'react'
import type { HoverTipState } from './hoverTipContent'
import { placeTip, TIP_OFFSET, type TipPosition } from './tipPlacement'

/**
 * 호버 설명 말풍선. 마우스 오른쪽 아래에 띄우고, 화면 끝을 넘으면 뒤집거나 화면 안으로 밀어 넣는다
 * (placeTip. 송출 화면 크게 배치의 스튜디오 축소판은 화면 오른쪽 끝에 있다).
 */
export function HoverTip({ tip }: { tip: HoverTipState }) {
  const tipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<TipPosition>({
    left: tip.x + TIP_OFFSET,
    top: tip.y + TIP_OFFSET,
  })

  // 말풍선 크기는 자리와 상관없으므로(w-max) 한 번 재면 자리가 정해지고 다시 바뀌지 않는다
  useLayoutEffect(() => {
    const element = tipRef.current
    const parent = element?.offsetParent
    if (element === null || !(parent instanceof HTMLElement)) return
    const origin = parent.getBoundingClientRect()
    const next = placeTip({
      x: tip.x,
      y: tip.y,
      width: element.offsetWidth,
      height: element.offsetHeight,
      originLeft: origin.left + parent.clientLeft,
      originTop: origin.top + parent.clientTop,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    setPosition((current) =>
      current.left === next.left && current.top === next.top ? current : next,
    )
  }, [tip])

  return (
    <div
      ref={tipRef}
      data-testid="hover-tip"
      className="pointer-events-none absolute z-20 w-max max-w-[220px] rounded-lg border-2 border-slate-500 bg-slate-950/95 px-2 py-1 text-xs shadow-[2px_2px_0_#000]"
      style={{ left: position.left, top: position.top }}
    >
      <div className="font-bold text-slate-50">{tip.title}</div>
      {tip.lines.map((line, index) => (
        <div key={`${index}:${line}`} className="text-slate-300">
          {line}
        </div>
      ))}
    </div>
  )
}
