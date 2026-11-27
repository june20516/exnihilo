import { afterEach, describe, expect, it, vi } from 'vitest'
import { feedArtImage } from './feedArt'

/** 아직 불러오는 중인 Image 대역. load를 직접 일으킬 수 있다 */
class PendingImage {
  complete = false
  naturalWidth = 0
  src = ''
  static listenerCount = 0
  private listener: (() => void) | null = null
  addEventListener(_type: string, listener: () => void) {
    PendingImage.listenerCount += 1
    this.listener = listener
  }
  load() {
    this.complete = true
    this.listener?.()
  }
}

describe('feedArtImage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('불러오는 동안 같은 그림을 여러 번 요청해도 load 리스너와 콜백이 한 번만 등록된다', () => {
    const created: PendingImage[] = []
    vi.stubGlobal(
      'Image',
      class extends PendingImage {
        constructor() {
          super()
          created.push(this)
        }
      },
    )
    const onLoad = vi.fn()
    const first = feedArtImage('rex', 'idle', onLoad)
    feedArtImage('rex', 'idle', onLoad)
    feedArtImage('rex', 'idle', onLoad)
    expect(created).toHaveLength(1)
    expect(PendingImage.listenerCount).toBe(1)

    created[0].load()
    expect(onLoad).toHaveBeenCalledTimes(1)
    expect(first).toBe(created[0])
  })
})
