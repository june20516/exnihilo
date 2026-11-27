// import.meta.glob은 Vite 기능이라, vite/client 타입이 없는 tsconfig.scripts.json에서도 검사되도록 참조한다.
/// <reference types="vite/client" />
import type { Pose } from '@/content/types'

/**
 * 출연자 포즈 그림 주소 표. 키는 '../assets/performers/<출연자 id>/<포즈>.png'다.
 * 그림 파일 이름은 엔진의 Pose와 1:1이라(spec 3.1) 따로 매핑 표를 두지 않는다.
 */
const ART_URLS: Readonly<Partial<Record<string, string>>> = import.meta.glob<string>(
  '../assets/performers/*/*.png',
  { eager: true, query: '?url', import: 'default' },
)

/** 출연자 id와 포즈의 그림 주소. 그림이 없는 출연자나 포즈면 throw한다. */
export function performerArtUrl(performerId: string, pose: Pose): string {
  const url = ART_URLS[`../assets/performers/${performerId}/${pose}.png`]
  if (url === undefined) {
    throw new Error(`출연자 그림이 없습니다: ${performerId}/${pose}`)
  }
  return url
}

/** 모든 출연자 그림 주소. 렌더러가 시작할 때 한 번에 불러 둔다. */
export function allPerformerArtUrls(): string[] {
  return Object.values(ART_URLS).filter((url): url is string => url !== undefined)
}
