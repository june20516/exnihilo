/**
 * 조정값을 어디서 읽을지 정한다. balance·mind를 import하지 않는다(순환 import 방지).
 */
import { readOverrides, type TuningStorage } from '../kit/tuning/tuning'

declare global {
  /** sim 스크립트가 앱 모듈을 불러오기 전에 두는 조정값(`npm run sim -- --tune <파일>`) */
  var __EXNIHILO_TUNING__: unknown
}

/** 브라우저 localStorage. 창이 없거나(노드) 접근이 throw하면(보안 설정 등) null */
export function browserStorage(): TuningStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 노드(sim)는 globalThis.__EXNIHILO_TUNING__, 브라우저는 localStorage. 둘 다 없으면 undefined */
export function initialOverrides(storageKey: string): { overrides: unknown; error: string | null } {
  if (globalThis.__EXNIHILO_TUNING__ !== undefined) {
    return { overrides: globalThis.__EXNIHILO_TUNING__, error: null }
  }
  return readOverrides(browserStorage(), storageKey)
}
