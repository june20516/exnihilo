import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** 길게 누르기로 인정하는 시간(ms)과, 그 사이 이만큼 움직이면 취소(드래그로 본다). */
const LONG_PRESS_MS = 500
const LONG_PRESS_MOVE = 6
/** 앵커와 툴팁 사이 간격, 화면 가장자리 여백(px). */
const GAP = 8
const MARGIN = 6

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  /** 탭이 이미 선택에 쓰이는 요소(카드 등): 터치에서 길게 눌러야 연다. 마우스는 올리면 연다. */
  longPress?: boolean
  /** 앵커 요소의 testid. */
  testId?: string
  className?: string
}

interface Position {
  readonly left: number
  readonly top: number
}

/**
 * 게임 화면의 유일한 추가 정보 표시 방식(표시 spec §2). 시트·모달 대신 그 자리에 뜬다.
 * 마우스를 올리면 열리고, 터치는 탭(또는 longPress면 길게 누르기)으로 열며, 바깥을 누르거나 Esc로 닫는다.
 * 화면 밖으로 나가면 위↔아래, 좌우를 뒤집어 화면 안에 둔다.
 */
export function Tooltip({ content, children, longPress = false, testId, className = '' }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  /** 길게 누르기로 막 열었으면, 손을 뗄 때 따라오는 click(선택)을 한 번 막는다. */
  const swallowClickRef = useRef(false)
  /** 열린 동안 내용·창 크기가 바뀌면 위치를 다시 잰다. */
  const [layoutTick, setLayoutTick] = useState(0)

  const cancelPress = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer)
    pressRef.current = null
  }, [])

  // 열릴 때(그리고 내용·창 크기가 바뀔 때) 크기를 재서 앵커 위(모자라면 아래)에, 좌우는 화면 안으로 맞춘다.
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const tip = tipRef.current?.getBoundingClientRect()
    if (!anchor || !tip) return
    const above = anchor.top - GAP - tip.height
    const top = above >= MARGIN ? above : Math.min(window.innerHeight - tip.height - MARGIN, anchor.bottom + GAP)
    const centered = anchor.left + anchor.width / 2 - tip.width / 2
    const left = Math.max(MARGIN, Math.min(window.innerWidth - tip.width - MARGIN, centered))
    setPosition({ left, top: Math.max(MARGIN, top) })
  }, [open, content, layoutTick])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && (anchorRef.current?.contains(target) || tipRef.current?.contains(target))) return
      setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const relayout = () => setLayoutTick((n) => n + 1)
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', relayout)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', relayout)
    }
  }, [open])

  useEffect(() => cancelPress, [cancelPress])

  const show = () => {
    setPosition(null)
    setOpen(true)
  }

  return (
    <span
      ref={anchorRef}
      data-testid={testId}
      className={`inline-flex ${className}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
      onPointerDown={(e) => {
        // 새로 누르면 지난 길게 누르기의 'click 막기'는 끝난다(따라오는 click이 없었던 경우).
        swallowClickRef.current = false
        if (e.pointerType === 'mouse') return
        if (!longPress) {
          if (open) setOpen(false)
          else show()
          return
        }
        cancelPress()
        pressRef.current = {
          x: e.clientX,
          y: e.clientY,
          timer: window.setTimeout(() => {
            swallowClickRef.current = true
            show()
          }, LONG_PRESS_MS),
        }
      }}
      onPointerMove={(e) => {
        const press = pressRef.current
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_MOVE) cancelPress()
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onClickCapture={(e) => {
        if (!swallowClickRef.current) return
        swallowClickRef.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            data-testid="tooltip"
            className="pointer-events-auto fixed z-[100] max-w-72 rounded-lg border border-outline-variant bg-surface-container-highest px-3 py-2 font-ui text-xs leading-relaxed text-on-surface shadow-2xl"
            style={position ?? { left: -9999, top: -9999 }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  )
}
