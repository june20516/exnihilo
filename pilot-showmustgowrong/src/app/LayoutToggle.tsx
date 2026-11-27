import { LAYOUT_LABELS, LAYOUT_ORDER, type LayoutMode } from './layout'

interface LayoutToggleProps {
  mode: LayoutMode
  onSelect(mode: LayoutMode): void
}

/** 아이콘 속 칸 하나(x, 너비). 높이는 아이콘 전체 */
interface IconPanel {
  x: number
  width: number
  /** 칸 안에 그릴 표시: 스튜디오(마름모) 또는 송출 모니터(빨간 점) */
  mark: 'studio' | 'monitor' | null
}

const ICON_WIDTH = 22
const ICON_HEIGHT = 14

/** 배치마다 아이콘의 칸. 왼쪽 좁은 칸은 로그, 마름모는 스튜디오, 빨간 점은 송출 모니터다 */
const ICON_PANELS: Record<LayoutMode, readonly IconPanel[]> = {
  default: [
    { x: 0, width: 4, mark: null },
    { x: 5, width: 8, mark: 'studio' },
    { x: 14, width: 8, mark: 'monitor' },
  ],
  studio: [
    { x: 0, width: 4, mark: null },
    { x: 5, width: 12, mark: 'studio' },
    { x: 18, width: 4, mark: 'monitor' },
  ],
  onair: [
    { x: 0, width: 4, mark: null },
    { x: 5, width: 12, mark: 'monitor' },
    { x: 18, width: 4, mark: 'studio' },
  ],
}

function LayoutIcon({ mode }: { mode: LayoutMode }) {
  const centerY = ICON_HEIGHT / 2
  return (
    <svg
      width={ICON_WIDTH}
      height={ICON_HEIGHT}
      viewBox={`0 0 ${ICON_WIDTH} ${ICON_HEIGHT}`}
      aria-hidden="true"
      className="block"
    >
      {ICON_PANELS[mode].map((panel) => {
        const centerX = panel.x + panel.width / 2
        // 좁은 칸의 표시는 작게 그린다
        const size = panel.width >= 8 ? 3 : 1.5
        return (
          <g key={panel.x}>
            <rect
              x={panel.x + 0.5}
              y={0.5}
              width={panel.width - 1}
              height={ICON_HEIGHT - 1}
              rx={1}
              fill="none"
              stroke="currentColor"
            />
            {panel.mark === 'studio' && (
              <polygon
                points={`${centerX},${centerY - size} ${centerX + size * 1.5},${centerY} ${centerX},${centerY + size} ${centerX - size * 1.5},${centerY}`}
                fill="currentColor"
              />
            )}
            {panel.mark === 'monitor' && <circle cx={centerX} cy={centerY} r={size * 0.7} fill="#ef4444" />}
          </g>
        )
      })}
    </svg>
  )
}

/** 위 띠 오른쪽의 배치 버튼 3개. 누르면 그 배치로 바로 가고, 지금 배치는 강조한다(L 키로 차례대로) */
export function LayoutToggle({ mode, onSelect }: LayoutToggleProps) {
  return (
    <div
      data-testid="layout-toggle"
      role="group"
      aria-label="화면 배치"
      className="flex shrink-0 items-center gap-1 rounded-lg border-2 border-slate-700 bg-slate-900 p-1"
    >
      {LAYOUT_ORDER.map((option) => {
        const selected = option === mode
        return (
          <button
            key={option}
            type="button"
            data-testid={`layout-${option}`}
            aria-label={LAYOUT_LABELS[option]}
            aria-pressed={selected}
            title={LAYOUT_LABELS[option]}
            onClick={() => onSelect(option)}
            className={`rounded-md border-2 px-1 py-1 ${
              selected
                ? 'border-amber-300 bg-amber-400/20 text-amber-200'
                : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}
          >
            <LayoutIcon mode={option} />
          </button>
        )
      })}
      <kbd className="rounded bg-slate-950 px-1 text-[10px] text-slate-400">L</kbd>
    </div>
  )
}
