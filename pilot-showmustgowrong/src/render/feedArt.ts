import type { BackdropKind, Pose } from '@/content/types'
import { findFeedBackdropUrl } from './backdropArt'
import { findPerformerArtUrl } from './performerArt'

/** 주소별로 한 번만 만든 그림. 카메라 화면이 매 프레임 새로 만들지 않게 한다 */
const images = new Map<string, HTMLImageElement>()
/** 아직 불러오는 그림을 기다리는 다시 그리기 호출. URL마다 load 리스너는 한 번만 단다 */
const waiting = new Map<string, Set<() => void>>()

/**
 * 출연자 포즈 그림. 그림이 없는 출연자·포즈면 null이다(그리기 루프라 throw하지 않는다).
 * 아직 불러오는 중이면 그림을 돌려주되 complete가 false이고, 다 불러오면 onLoad를 부른다(같은 함수는 한 번만 모은다).
 */
export function feedArtImage(
  performerId: string,
  pose: Pose,
  onLoad: () => void,
): HTMLImageElement | null {
  const url = findPerformerArtUrl(performerId, pose)
  return url === undefined ? null : cachedImage(url, onLoad)
}

/** 카메라 화면 배경 그림. 불러오기·다시 그리기 규칙은 feedArtImage와 같다 */
export function feedBackdropImage(kind: BackdropKind, onLoad: () => void): HTMLImageElement | null {
  const url = findFeedBackdropUrl(kind)
  return url === undefined ? null : cachedImage(url, onLoad)
}

/** url의 그림을 한 번만 만들고, 불러오는 중이면 onLoad를 대기 목록에 넣는다 */
function cachedImage(url: string, onLoad: () => void): HTMLImageElement {
  let image = images.get(url)
  if (image === undefined) {
    image = new Image()
    image.src = url
    images.set(url, image)
  }
  if (!image.complete) {
    let callbacks = waiting.get(url)
    if (callbacks === undefined) {
      const pending = new Set<() => void>()
      callbacks = pending
      waiting.set(url, pending)
      image.addEventListener(
        'load',
        () => {
          waiting.delete(url)
          pending.forEach((callback) => callback())
        },
        { once: true },
      )
    }
    callbacks.add(onLoad)
  }
  return image
}

/** 그림을 그릴 수 있게 불러왔는지 */
export function isArtReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0
}
