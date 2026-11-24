/** 장르와 무관한 기본 연출. 모두 Web Animations API로 동작하고, 끝나면 resolve한다. */

export type PopTone = 'damage' | 'heal' | 'block' | 'poison'

const POP_COLORS: Record<PopTone, string> = {
  damage: '#ffb4ab',
  heal: '#87d4c9',
  block: '#a3f1e5',
  poison: '#8bd8cd',
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function wait(ms: number, speed: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms / speed))
}

async function run(el: Element, keyframes: Keyframe[], duration: number, speed: number): Promise<void> {
  await el.animate(keyframes, { duration: duration / speed, easing: 'ease-out' }).finished
}

export async function shake(el: Element, intensity: number, speed: number): Promise<void> {
  if (prefersReducedMotion()) return
  const d = intensity
  await run(
    el,
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-d}px, ${d / 2}px)` },
      { transform: `translate(${d}px, ${-d / 2}px)` },
      { transform: `translate(${-d / 2}px, 0)` },
      { transform: 'translate(0, 0)' },
    ],
    280,
    speed,
  )
}

export async function flash(el: Element, color: string, speed: number): Promise<void> {
  await run(
    el,
    [{ boxShadow: `0 0 0 4px ${color}, 0 0 32px ${color}` }, { boxShadow: '0 0 0 0 transparent' }],
    420,
    speed,
  )
}

/** 대상 요소 위에 숫자를 띄웠다가 사라지게 한다. */
export async function popNumber(anchor: Element, text: string, tone: PopTone, speed: number): Promise<void> {
  const rect = anchor.getBoundingClientRect()
  const label = document.createElement('div')
  label.textContent = text
  Object.assign(label.style, {
    position: 'fixed',
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top + rect.height / 3}px`,
    transform: 'translate(-50%, 0)',
    font: '900 36px "Noto Serif KR", serif',
    color: POP_COLORS[tone],
    textShadow: '0 2px 8px rgba(0,0,0,0.9)',
    pointerEvents: 'none',
    zIndex: '100',
  })
  document.body.appendChild(label)
  const rise = prefersReducedMotion() ? 0 : 56
  try {
    await run(
      label,
      [
        { opacity: 0, transform: 'translate(-50%, 8px) scale(0.8)' },
        { opacity: 1, transform: 'translate(-50%, 0) scale(1.1)', offset: 0.2 },
        { opacity: 0, transform: `translate(-50%, ${-rise}px) scale(1)` },
      ],
      800,
      speed,
    )
  } finally {
    label.remove()
  }
}
