import { useCallback } from 'react'
import type { StudioHit } from '@/render/StudioRenderer'
import type { BroadcastInput } from '@/sim/engineTypes'

/** 스튜디오 클릭을 판정하는 데 필요한 화면 상태(Ruling R4) */
export interface StudioClickState {
  /** 'ad'는 광고 중(광고 입력을 보낸 뒤 복귀까지)이다. */
  phase: 'live' | 'ad' | 'ended'
  interventionOpen: boolean
  /** 무대에 남아 지시·추적할 수 있는 출연자 id(이탈하거나 출구로 걷는 출연자는 없다) */
  activeActorIds: ReadonlySet<string>
}

/** selectTarget: 개입 대상으로 고른다. showInfo: 정보 설명을 그 자리에 고정해 띄운다. */
export type StudioClickResult = 'selectTarget' | 'showInfo' | null

type PersonHit = Extract<StudioHit, { kind: 'actor' | 'staff' }>

/** 무대에 남은 출연자이거나 스태프인가(이탈한 출연자는 아무것도 하지 않는다). */
function isAvailablePerson(hit: StudioHit | null, state: StudioClickState): hit is PersonHit {
  if (hit?.kind === 'staff') return true
  return hit?.kind === 'actor' && state.activeActorIds.has(hit.id)
}

/**
 * 스튜디오 클릭 규칙. 개입 중에는 출연자·스태프가 개입 대상이 되고('selectTarget'),
 * 개입 밖 방송 중에는 그 정보를 고정해 띄운다('showInfo'). 클로즈업 대상은 클릭이 아니라
 * 카메라를 끌어 놓아 바꾼다(aimDropInput).
 * 광고 중, 방송 종료 뒤, 이탈한 출연자, 빈 곳(장비·현상 포함)은 아무것도 하지 않는다.
 */
export function studioClickInput(
  hit: StudioHit | null,
  state: StudioClickState,
): StudioClickResult {
  if (state.phase !== 'live' || !isAvailablePerson(hit, state)) return null
  return state.interventionOpen ? 'selectTarget' : 'showInfo'
}

/**
 * 카메라를 끌어 hit 위에 놓았을 때의 입력. 방송 중 무대에 남은 출연자 위면 그 카메라의
 * 추적 대상을 바꾼다(track, 공짜라 개입 중에도 받는다). 그 밖에는 null(취소).
 */
export function aimDropInput(
  hit: StudioHit | null,
  state: StudioClickState,
  cameraId: string,
): BroadcastInput | null {
  if (state.phase !== 'live' || hit?.kind !== 'actor') return null
  if (!state.activeActorIds.has(hit.id)) return null
  return { type: 'track', cameraId, actorId: hit.id }
}

interface StudioClickHandlers {
  selectTarget(hit: PersonHit): void
  showInfo(hit: PersonHit): void
  /** 사람이 아닌 곳을 눌렀을 때(고정한 정보를 닫는다) */
  clearInfo(): void
}

/** studioClickInput의 판정을 대상 선택이나 정보 고정으로 옮기는 클릭 핸들러 */
export function useStudioClick(
  state: StudioClickState,
  { selectTarget, showInfo, clearInfo }: StudioClickHandlers,
): (hit: StudioHit | null) => void {
  return useCallback(
    (hit: StudioHit | null) => {
      const result = studioClickInput(hit, state)
      if (result === null || !isAvailablePerson(hit, state)) {
        clearInfo()
        return
      }
      if (result === 'selectTarget') selectTarget(hit)
      else showInfo(hit)
    },
    [state, selectTarget, showInfo, clearInfo],
  )
}
