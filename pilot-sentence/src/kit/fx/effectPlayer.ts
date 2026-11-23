export type EffectHandler<E> = (event: E, speed: number) => Promise<void>

export type EffectHandlers<E extends { type: string }> = Partial<{
  [K in E['type']]: EffectHandler<Extract<E, { type: K }>>
}>

export interface EffectPlayer<E> {
  play(events: readonly E[]): Promise<void>
  isPlaying(): boolean
  setSpeed(speed: number): void
}

/** 이벤트를 순서대로 연출한다. 핸들러가 없으면 건너뛰고, 실패해도 다음 이벤트로 넘어간다. */
export function createEffectPlayer<E extends { type: string }>(
  handlers: EffectHandlers<E>,
  options: { speed: number },
): EffectPlayer<E> {
  let speed = options.speed
  let playing = false

  return {
    async play(events) {
      playing = true
      try {
        for (const event of events) {
          const handler = handlers[event.type as E['type']] as EffectHandler<E> | undefined
          if (!handler) continue
          try {
            await handler(event, speed)
          } catch (error) {
            console.error(`연출 실패: ${event.type}`, error)
          }
        }
      } finally {
        playing = false
      }
    },
    isPlaying: () => playing,
    setSpeed(next) {
      speed = next
    },
  }
}
