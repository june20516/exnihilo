import { prefersReducedMotion } from '@/kit/fx/primitives'

/** 잉크 모티프 연출. 문장 던전 고유. */

const INK_RED = '#ff5a52'

export async function inkSpread(el: Element, speed: number): Promise<void> {
  await el.animate(
    [
      { clipPath: 'circle(0% at 50% 50%)', filter: 'blur(2px)' },
      { clipPath: 'circle(75% at 50% 50%)', filter: 'blur(0)' },
    ],
    { duration: 320 / speed, easing: 'ease-out' },
  ).finished
}

/** 적 초상화에서 슬롯까지 붉은 펜 획을 긋는다. */
export async function penStroke(from: Element, to: Element, speed: number): Promise<void> {
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  Object.assign(svg.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '90',
  })
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  const [x1, y1] = [a.left + a.width / 2, a.top + a.height / 2]
  const [x2, y2] = [b.left + b.width / 2, b.top + b.height / 2]
  const cx = (x1 + x2) / 2
  const cy = Math.min(y1, y2) - 80
  path.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', INK_RED)
  path.setAttribute('stroke-width', '4')
  path.setAttribute('stroke-linecap', 'round')
  svg.appendChild(path)
  document.body.appendChild(svg)
  const length = path.getTotalLength()
  path.style.strokeDasharray = `${length}`
  try {
    await path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: 420 / speed,
      easing: 'ease-in-out',
    }).finished
    await svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 / speed }).finished
  } finally {
    svg.remove()
  }
}

/** 절의 슬롯을 왼쪽부터 차례로 밝힌다(낭독). */
export async function readAloud(slots: readonly Element[], speed: number): Promise<void> {
  for (const slot of slots) {
    await slot.animate(
      [
        { filter: 'brightness(1)', transform: 'scale(1)' },
        { filter: 'brightness(1.8)', transform: 'scale(1.06)' },
        { filter: 'brightness(1)', transform: 'scale(1)' },
      ],
      { duration: 160 / speed },
    ).finished
  }
}

export async function fadeAway(el: Element, speed: number): Promise<void> {
  await el.animate(
    [
      { opacity: 1, filter: 'blur(0)', letterSpacing: '0' },
      { opacity: 0.2, filter: 'blur(3px)', letterSpacing: '0.3em' },
      { opacity: 1, filter: 'blur(0)', letterSpacing: '0' },
    ],
    { duration: 400 / speed },
  ).finished
}

/** 초상화가 아래로 녹아내린다. */
export async function meltDown(el: Element, speed: number): Promise<void> {
  if (prefersReducedMotion()) return
  await el.animate(
    [
      { clipPath: 'inset(0 0 0 0)', filter: 'grayscale(0)' },
      { clipPath: 'inset(0 0 100% 0)', filter: 'grayscale(1)' },
      { clipPath: 'inset(0 0 0 0)', filter: 'grayscale(1)' },
    ],
    { duration: 700 / speed, easing: 'ease-in' },
  ).finished
}
