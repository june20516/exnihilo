import type { Pose } from '@/content/types'
import { findPerformerArtUrl } from './performerArt'

/** 주소별로 한 번만 만든 그림. 카메라 화면이 매 프레임 새로 만들지 않게 한다 */
const images = new Map<string, HTMLImageElement>()

/**
 * 출연자 포즈 그림. 그림이 없는 출연자·포즈면 null이다(그리기 루프라 throw하지 않는다).
 * 아직 불러오는 중이면 그림을 돌려주되 complete가 false이고, 다 불러오면 onLoad를 한 번 부른다.
 */
export function feedArtImage(
  performerId: string,
  pose: Pose,
  onLoad: () => void,
): HTMLImageElement | null {
  const url = findPerformerArtUrl(performerId, pose)
  if (url === undefined) return null
  let image = images.get(url)
  if (image === undefined) {
    image = new Image()
    image.src = url
    images.set(url, image)
  }
  if (!image.complete) image.addEventListener('load', onLoad, { once: true })
  return image
}

/** 그림을 그릴 수 있게 불러왔는지 */
export function isArtReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0
}
