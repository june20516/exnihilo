import { describe, expect, it } from 'vitest'
import { LAYOUT_STORAGE_KEY, loadLayout, nextLayout, saveLayout } from './layout'

/** 키 하나만 담는 메모리 저장소 */
function storageWith(value: string | null): Storage {
  const items = new Map<string, string>()
  if (value !== null) items.set(LAYOUT_STORAGE_KEY, value)
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key)
    },
    setItem: (key, item) => {
      items.set(key, item)
    },
  }
}

/** 사파리 비공개 모드처럼 읽기·쓰기마다 예외를 던지는 저장소 */
const throwingStorage: Storage = {
  length: 0,
  clear: () => {
    throw new Error('저장소 사용 불가')
  },
  getItem: () => {
    throw new Error('저장소 사용 불가')
  },
  key: () => null,
  removeItem: () => {
    throw new Error('저장소 사용 불가')
  },
  setItem: () => {
    throw new Error('저장소 사용 불가')
  },
}

describe('배치 순서', () => {
  it('기본 → 스튜디오 크게 → 송출 화면 크게 → 기본', () => {
    expect(nextLayout('default')).toBe('studio')
    expect(nextLayout('studio')).toBe('onair')
    expect(nextLayout('onair')).toBe('default')
  })
})

describe('배치 저장', () => {
  it('저장소가 없거나 값이 없으면 기본이다', () => {
    expect(loadLayout(null)).toBe('default')
    expect(loadLayout(storageWith(null))).toBe('default')
  })

  it('깨진 값이나 접근 예외는 기본으로 연다', () => {
    expect(loadLayout(storageWith('weird'))).toBe('default')
    expect(loadLayout(storageWith(''))).toBe('default')
    expect(loadLayout(throwingStorage)).toBe('default')
  })

  it('저장한 배치를 다시 읽는다', () => {
    const storage = storageWith(null)
    saveLayout(storage, 'onair')
    expect(storage.getItem(LAYOUT_STORAGE_KEY)).toBe('onair')
    expect(loadLayout(storage)).toBe('onair')
  })

  it('쓰기 예외나 저장소 없음은 삼킨다', () => {
    expect(() => saveLayout(throwingStorage, 'studio')).not.toThrow()
    expect(() => saveLayout(null, 'studio')).not.toThrow()
  })
})
