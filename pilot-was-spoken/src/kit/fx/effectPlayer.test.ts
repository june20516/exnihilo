import { createEffectPlayer } from './effectPlayer'

test('이벤트를 순서대로 재생하고 핸들러 없는 이벤트는 건너뛴다', async () => {
  const log: string[] = []
  const player = createEffectPlayer<{ type: 'a' | 'b' | 'c' }>(
    {
      a: async () => {
        log.push('a')
      },
      c: async () => {
        log.push('c')
      },
    },
    { speed: 1 },
  )
  await player.play([{ type: 'a' }, { type: 'b' }, { type: 'c' }])
  expect(log).toEqual(['a', 'c'])
  expect(player.isPlaying()).toBe(false)
})

test('재생 중에는 isPlaying이 true', async () => {
  let observed = false
  const player = createEffectPlayer<{ type: 'a' }>(
    {
      a: async () => {
        observed = player.isPlaying()
      },
    },
    { speed: 1 },
  )
  await player.play([{ type: 'a' }])
  expect(observed).toBe(true)
})

test('핸들러가 실패해도 다음 이벤트를 재생', async () => {
  const log: string[] = []
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const player = createEffectPlayer<{ type: 'a' | 'b' }>(
    {
      a: async () => {
        throw new Error('x')
      },
      b: async () => {
        log.push('b')
      },
    },
    { speed: 1 },
  )
  await player.play([{ type: 'a' }, { type: 'b' }])
  expect(log).toEqual(['b'])
  errorSpy.mockRestore()
})

test('핸들러는 현재 속도를 받는다', async () => {
  const speeds: number[] = []
  const player = createEffectPlayer<{ type: 'a' }>(
    {
      a: async (_e, speed) => {
        speeds.push(speed)
      },
    },
    { speed: 1 },
  )
  player.setSpeed(2)
  await player.play([{ type: 'a' }])
  expect(speeds).toEqual([2])
})
