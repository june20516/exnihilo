import { useLayoutEffect, useRef, useState } from 'react'
import type { HoverTipState } from './hoverTipContent'

/** 마우스와 말풍선 사이 간격(px) */
const TIP_OFFSET = 14

/** 말풍선을 마우스의 어느 쪽에 둘지. 화면 끝을 넘으면 반대쪽으로 뒤집는다 */
interface TipPlacement {
  left: boolean
  up: boolean
}

/**
 * 호버 설명 말풍선. 마우스 오른쪽 아래에 띄우고, 화면 오른쪽이나 아래를 넘으면 왼쪽이나 위로 뒤집는다
 * (송출 화면 크게 배치의 스튜디오 축소판은 화면 오른쪽 끝에 있다).
 */
export function HoverTip({ tip }: { tip: HoverTipState }) {
  const tipRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<TipPlacement>({ left: false, up: false })

  // 뒤집기 판단은 뒤집지 않았을 때의 자리로만 하므로 측정 결과가 자리에 따라 왔다 갔다 하지 않는다
  useLayoutEffect(() => {
    const element = tipRef.current
    const parent = element?.offsetParent
    if (element === null || !(parent instanceof HTMLElement)) return
    const origin = parent.getBoundingClientRect()
    const right = origin.left + parent.clientLeft + tip.x + TIP_OFFSET + element.offsetWidth
    const bottom = origin.top + parent.clientTop + tip.y + TIP_OFFSET + element.offsetHeight
    const next: TipPlacement = { left: right > window.innerWidth, up: bottom > window.innerHeight }
    setPlacement((current) =>
      current.left === next.left && current.up === next.up ? current : next,
    )
  }, [tip])

  return (
    <div
      ref={tipRef}
      data-testid="hover-tip"
      className="pointer-events-none absolute z-20 w-max max-w-[220px] rounded-lg border-2 border-slate-500 bg-slate-950/95 px-2 py-1 text-xs shadow-[2px_2px_0_#000]"
      style={{
        left: placement.left ? tip.x - TIP_OFFSET : tip.x + TIP_OFFSET,
        top: placement.up ? tip.y - TIP_OFFSET : tip.y + TIP_OFFSET,
        transform: `translate(${placement.left ? '-100%' : '0'}, ${placement.up ? '-100%' : '0'})`,
      }}
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
