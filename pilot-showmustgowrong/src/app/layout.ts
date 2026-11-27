/**
 * 방송 화면 배치(spec 2절). 세 배치는 같은 DOM 구조에서 grid 영역과 열 너비만 바꾼다.
 * - default: 왼쪽 260 | 스튜디오 | 송출 모니터(가운데와 오른쪽 반반), 미리보기 3칸 가로
 * - studio: 왼쪽 260 | 스튜디오 크게 | 오른쪽 260(작은 송출 모니터), 미리보기 3칸 세로
 * - onair: 왼쪽 260 | 송출 모니터 크게 | 오른쪽 260(스튜디오 축소판), 미리보기 3칸 세로
 */
export type LayoutMode = 'default' | 'studio' | 'onair'

/** L 키를 누를 때 도는 순서 */
export const LAYOUT_ORDER: readonly LayoutMode[] = ['default', 'studio', 'onair']

export const LAYOUT_STORAGE_KEY = 'exnihilo.showmustgowrong.layout'

/** 위 띠 배치 버튼과 aria-label에 쓰는 이름 */
export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  default: '기본',
  studio: '스튜디오 크게',
  onair: '송출 화면 크게',
}

/** 배치마다 grid 열 너비와 영역. 영역 이름은 BroadcastStage의 칸이 gridArea로 쓴다. */
export interface LayoutGrid {
  columns: string
  areas: string
  /** 크게 보이는 칸(스튜디오나 송출 모니터). 슬로모션 배지와 광고 화면을 이 위에 띄운다 */
  mainArea: 'studio' | 'monitor'
  /** 미리보기 3칸 방향 */
  previews: 'row' | 'column'
}

/** 왼쪽 칸과 작은 오른쪽 칸 너비(px) */
const SIDE_COLUMN = '260px'

export const LAYOUT_GRIDS: Record<LayoutMode, LayoutGrid> = {
  default: {
    columns: `${SIDE_COLUMN} minmax(0, 1fr) minmax(0, 1fr)`,
    areas: '"log studio monitor" "log studio slots" "log studio help" "log studio actions"',
    mainArea: 'studio',
    previews: 'row',
  },
  studio: {
    columns: `${SIDE_COLUMN} minmax(0, 1fr) ${SIDE_COLUMN}`,
    areas: '"log studio monitor" "log studio slots" "log studio help" "log studio actions"',
    mainArea: 'studio',
    previews: 'column',
  },
  onair: {
    columns: `${SIDE_COLUMN} minmax(0, 1fr) ${SIDE_COLUMN}`,
    areas: '"log monitor studio" "log monitor slots" "log monitor help" "log monitor actions"',
    mainArea: 'monitor',
    previews: 'column',
  },
}

export function nextLayout(mode: LayoutMode): LayoutMode {
  const index = LAYOUT_ORDER.indexOf(mode)
  return LAYOUT_ORDER[(index + 1) % LAYOUT_ORDER.length]
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return LAYOUT_ORDER.some((mode) => mode === value)
}

/** 브라우저 저장소. 없거나 접근만 해도 예외를 던지면(사파리 비공개 모드 등) null */
export function layoutStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 저장된 배치. 저장소가 없거나 값이 없거나 깨졌거나 읽다 예외가 나면 기본 */
export function loadLayout(storage: Storage | null): LayoutMode {
  if (storage === null) return 'default'
  try {
    const stored = storage.getItem(LAYOUT_STORAGE_KEY)
    return isLayoutMode(stored) ? stored : 'default'
  } catch {
    return 'default'
  }
}

/** 배치를 남긴다. 저장소를 쓸 수 없으면 조용히 넘긴다(이번 방문 동안만 유지된다) */
export function saveLayout(storage: Storage | null, mode: LayoutMode): void {
  if (storage === null) return
  try {
    storage.setItem(LAYOUT_STORAGE_KEY, mode)
  } catch {
    // 저장 실패는 화면 동작에 영향이 없으므로 무시한다
  }
}
