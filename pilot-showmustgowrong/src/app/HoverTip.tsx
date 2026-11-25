import type { HoverTipState } from './hoverTipContent'

/** 호버 설명 말풍선. 마우스 오른쪽 아래에 띄운다. */
export function HoverTip({ tip }: { tip: HoverTipState }) {
  return (
    <div
      data-testid="hover-tip"
      className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg border-2 border-slate-500 bg-slate-950/95 px-2 py-1 text-xs shadow-[2px_2px_0_#000]"
      style={{ left: tip.x + 14, top: tip.y + 14 }}
    >
      <div className="font-bold text-slate-50">{tip.title}</div>
      {tip.lines.map((line) => (
        <div key={line} className="text-slate-300">
          {line}
        </div>
      ))}
    </div>
  )
}
