import { type PointerEvent, type ReactNode, useRef, useState } from 'react'
import { Icon } from './Icon'

/** 손가락을 이만큼(px) 안쪽으로 밀면 열고, 바깥쪽으로 밀면 닫는다. */
const SWIPE_DISTANCE = 24

interface DrawerProps {
  /** 붙는 벽: 문장판의 왼쪽 또는 오른쪽 가장자리. */
  side: 'left' | 'right'
  icon: string
  label: string
  /** 열렸을 때 패널 폭(px). */
  width: number
  testId: string
  /** 카드를 끄는 중에는 마우스가 지나가도 열지 않는다. */
  hoverDisabled: boolean
  children: ReactNode
}

/**
 * 문장판 가장자리(벽)에 붙은 서랍. 벽 쪽은 평평하고 안쪽 모서리만 둥글다. 손잡이는 패널 안쪽 끝에 붙어 함께 움직인다.
 * 마우스: 손잡이에 올리면 열리고(벗어나면 닫힘), 누르면 열린 채 고정된다. 터치: 탭으로 여닫고, 안쪽·바깥쪽으로 밀어 여닫는다.
 * 닫혀 있어도 내용은 DOM에 남는다(inert로 조작만 막는다).
 */
export function Drawer({ side, icon, label, width, testId, hoverDisabled, children }: DrawerProps) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const swipeRef = useRef<{ x: number; swiped: boolean } | null>(null)
  const open = pinned || (hovered && !hoverDisabled)
  const left = side === 'left'

  const close = () => {
    setPinned(false)
    setHovered(false)
  }
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') swipeRef.current = { x: e.clientX, swiped: false }
  }
  const onPointerMove = (e: PointerEvent) => {
    const swipe = swipeRef.current
    if (!swipe || swipe.swiped) return
    const inward = (e.clientX - swipe.x) * (left ? 1 : -1)
    if (inward > SWIPE_DISTANCE) setPinned(true)
    else if (inward < -SWIPE_DISTANCE) close()
    else return
    swipe.swiped = true
  }
  const onHandleClick = () => {
    // 밀어서 여닫았으면 손을 뗄 때 따라오는 click은 무시한다.
    if (swipeRef.current?.swiped) {
      swipeRef.current = null
      return
    }
    swipeRef.current = null
    if (pinned) close()
    else setPinned(true)
  }

  const panel = (
    <div
      inert={!open}
      className={`flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-surface-container-high/95 p-4 shadow-[0_0_24px_rgba(0,0,0,0.55)] backdrop-blur short:gap-2 short:p-3 ${
        left ? 'rounded-r-2xl' : 'rounded-l-2xl'
      }`}
      style={{ width }}
    >
      {children}
    </div>
  )
  const handle = (
    <button
      type="button"
      data-testid={`${testId}-handle`}
      aria-expanded={open}
      aria-label={`${label} ${open ? '닫기' : '열기'}`}
      onClick={onHandleClick}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      className={`flex h-36 w-9 shrink-0 flex-col items-center justify-center gap-2 bg-surface-container-highest font-ui text-[13px] font-bold text-secondary shadow-lg ${
        left ? 'rounded-r-xl' : 'rounded-l-xl'
      }`}
    >
      <Icon name={icon} className="text-[20px]" />
      <span className="[writing-mode:vertical-rl] tracking-[0.15em]">{label}</span>
      <Icon name={open === left ? 'chevron_left' : 'chevron_right'} className="text-[18px]" />
    </button>
  )
  return (
    <div
      data-testid={testId}
      data-open={open}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(false)}
      className={`absolute bottom-0 top-0 z-20 flex items-center transition-transform duration-200 ${left ? 'left-0' : 'right-0 flex-row-reverse'}`}
      style={{ transform: open ? 'none' : `translateX(${left ? -width : width}px)` }}
    >
      {panel}
      {handle}
    </div>
  )
}
