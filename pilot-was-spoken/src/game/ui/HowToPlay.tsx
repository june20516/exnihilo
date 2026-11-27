import { useEffect, useState } from 'react'
import { HOW_TO_PLAY_STEPS } from './howToPlaySteps'
import { Icon } from './Icon'

/**
 * 조작 안내 창. 게임 화면(위치 기준이 되는 부모) 전체를 덮어 한 장씩 넘겨 본다. 마지막 장의 "시작하기", "건너뛰기", Esc, 바깥 누르기로 닫는다.
 */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const step = HOW_TO_PLAY_STEPS[index]
  const last = index === HOW_TO_PLAY_STEPS.length - 1

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, HOW_TO_PLAY_STEPS.length - 1))
      else if (event.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!step) return null
  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" data-testid="how-to-play" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
        className="flex w-[560px] max-w-full flex-col gap-4 rounded-2xl bg-surface-container p-6 shadow-2xl short:gap-2.5 short:p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between font-ui text-sm text-on-surface-variant">
          <span>플레이 방법</span>
          <span className="font-number" data-testid="how-to-play-page">
            {index + 1} / {HOW_TO_PLAY_STEPS.length}
          </span>
        </header>
        <div className="flex items-start gap-4">
          <Icon name={step.icon} className="shrink-0 text-[44px] text-secondary short:text-[34px]" />
          <div className="flex min-w-0 flex-col gap-2 short:gap-1.5">
            <h2 id="how-to-play-title" className="break-keep font-prose text-2xl font-bold short:text-xl">
              {step.title}
            </h2>
            {step.lines.map((line) => (
              <p key={line} className="break-keep font-ui text-base leading-relaxed text-on-surface short:text-sm short:leading-snug">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {HOW_TO_PLAY_STEPS.map((s, i) => (
            <span key={s.title} className={`h-2 w-2 rounded-full ${i === index ? 'bg-secondary' : 'bg-outline-variant'}`} />
          ))}
        </div>
        <footer className="flex items-center justify-between gap-2">
          <button type="button" data-testid="how-to-play-skip" onClick={onClose} className="rounded-lg px-3 py-2 font-ui text-sm text-on-surface-variant">
            건너뛰기
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="how-to-play-prev"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              className="rounded-lg bg-surface-container-high px-4 py-2 font-ui text-base font-bold disabled:opacity-30"
            >
              이전
            </button>
            <button
              type="button"
              data-testid="how-to-play-next"
              onClick={() => (last ? onClose() : setIndex(index + 1))}
              className="rounded-lg bg-secondary-container px-5 py-2 font-ui text-base font-bold text-on-secondary-container"
            >
              {last ? '시작하기' : '다음'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
