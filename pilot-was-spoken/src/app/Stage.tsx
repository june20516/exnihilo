import { type ReactNode, useEffect, useState } from 'react'

/**
 * 배치 하나를 화면 크기에 맞춰 줄인다(표시 spec §3.8). 기준 크기에서 한 화면에 들어가도록 만든 배치를,
 * 화면이 기준보다 작으면 루트 전체를 같은 비율로 줄인다(데스크탑용·모바일용을 따로 두지 않는다).
 * 기준 크기는 터치 대상 최소 40px을 지키는 값이다: 844×390에서 비율 약 0.67 → 64px 버튼이 43px.
 */
const STAGE = { width: 1180, height: 580 } as const

function currentZoom(): number {
  const height = window.visualViewport?.height ?? window.innerHeight
  return Math.min(1, window.innerWidth / STAGE.width, height / STAGE.height)
}

export function Stage({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState(currentZoom)
  useEffect(() => {
    const update = () => setZoom(currentZoom())
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])
  return (
    <>
      <div data-testid="rotate-notice" className="rotate-notice h-[100dvh] flex-col items-center justify-center gap-3 bg-surface-container-lowest p-6 text-center">
        <span className="material-symbols-outlined text-6xl text-secondary">screen_rotation</span>
        <p className="font-prose text-2xl font-bold">가로로 돌려 주세요</p>
        <p className="font-ui text-sm text-on-surface-variant">문장 던전은 가로 화면에서만 플레이할 수 있습니다.</p>
      </div>
      {/* 줄인 만큼 안쪽 크기를 키워(100/zoom) 화면을 꽉 채운다. zoom은 자기 크기에도 곱해진다. */}
      <div className="stage overflow-hidden" style={{ zoom, width: `${100 / zoom}vw`, height: `${100 / zoom}dvh` }}>
        {children}
      </div>
    </>
  )
}
