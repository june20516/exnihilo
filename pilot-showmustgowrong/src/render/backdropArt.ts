// import.meta.glob은 Vite 기능이라, vite/client 타입이 없는 tsconfig.scripts.json에서도 검사되도록 참조한다.
/// <reference types="vite/client" />
import type { BackdropKind } from '@/content/types'
import type { StudioPlaneId } from './backdrop'

/**
 * 배경 그림 주소 표. 키는 '../assets/backgrounds/<파일>.jpg'다.
 * 원본은 art-source/backgrounds/에 있고 자르기·압축 명령은 Task 7b 보고서에 있다.
 */
const BACKDROP_URLS: Readonly<Partial<Record<string, string>>> = import.meta.glob<string>(
  '../assets/backgrounds/*.jpg',
  { eager: true, query: '?url', import: 'default' },
)

const FEED_FILES: Readonly<Record<BackdropKind, string>> = {
  stage: 'feed-stage',
  audience: 'feed-audience',
}

function findUrl(file: string): string | undefined {
  return BACKDROP_URLS[`../assets/backgrounds/${file}.jpg`]
}

/** 카메라 화면 배경 그림 주소. 없으면 undefined(그리기 루프라 throw하지 않고 단색으로 그린다) */
export function findFeedBackdropUrl(kind: BackdropKind): string | undefined {
  return findUrl(FEED_FILES[kind])
}

/** 스튜디오 면 그림 주소 전부. 하나라도 없으면 throw한다(렌더러 생성 때 바로 알린다) */
export function studioBackdropUrls(): Record<StudioPlaneId, string> {
  return {
    floor: requireUrl('floor'),
    backWall: requireUrl('wall-back'),
    sideWall: requireUrl('wall-side'),
  }
}

function requireUrl(file: string): string {
  const url = findUrl(file)
  if (url === undefined) throw new Error(`스튜디오 배경 그림이 없습니다: ${file}.jpg`)
  return url
}
