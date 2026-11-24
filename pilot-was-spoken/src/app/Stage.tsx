import { type ReactNode, useEffect, useState } from 'react'

/**
 * 배치 하나를 화면 폭에 맞춰 줄인다(표시 spec §3.8). 기준 폭보다 좁으면 루트 전체를 같은 비율로 줄인다
 * (데스크탑용·모바일용을 따로 두지 않는다). 높이에는 맞추지 않는다: 높이까지 맞추면 글자가 읽기 어려울 만큼 작아지므로,
 * 줄인 뒤 높이가 최소 높이보다 모자라면 최소 높이를 지키고 세로 스크롤로 내려 보게 한다.
 * 기준 폭 1180에서 844px 화면은 비율 약 0.72 → 60px 버튼이 43px(터치 대상 40px 이상).
 */
const STAGE = { width: 1180, minHeight: 520 } as const

function currentZoom(): number {
  return Math.min(1, window.innerWidth / STAGE.width)
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
      <div data-testid="stage" className="stage overflow-x-hidden overflow-y-auto" style={{ zoom, width: `${100 / zoom}vw`, height: `${100 / zoom}dvh` }}>
        <div style={{ height: '100%', minHeight: STAGE.minHeight }}>{children}</div>
      </div>
    </>
  )
}
