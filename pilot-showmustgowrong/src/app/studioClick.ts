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
  /** 클로즈업(추적) 카메라 id. 없으면 null */
  trackingCameraId: string | null
}

export type StudioClickResult = BroadcastInput | 'selectTarget' | null

/**
 * 스튜디오 클릭 규칙. 개입 중에는 출연자·스태프가 개입 대상이 되고('selectTarget'),
 * 개입 밖 방송 중에는 출연자를 클로즈업 대상으로 고른다(track, 공짜).
 * 광고 중, 방송 종료 뒤, 이탈한 출연자, 빈 곳(장비·현상 포함)은 아무 입력도 보내지 않는다.
 */
export function studioClickInput(
  hit: StudioHit | null,
  state: StudioClickState,
): StudioClickResult {
  if (hit === null || state.phase !== 'live') return null
  if (hit.kind === 'actor') {
    if (!state.activeActorIds.has(hit.id)) return null
    if (state.interventionOpen) return 'selectTarget'
    if (state.trackingCameraId === null) return null
    return { type: 'track', cameraId: state.trackingCameraId, actorId: hit.id }
  }
  if (hit.kind === 'staff') return state.interventionOpen ? 'selectTarget' : null
  return null
}

interface StudioClickHandlers {
  send(input: BroadcastInput): void
  selectTarget(hit: Extract<StudioHit, { kind: 'actor' | 'staff' }>): void
}

/** studioClickInput의 판정을 실제 입력이나 대상 선택으로 옮기는 클릭 핸들러 */
export function useStudioClick(
  state: StudioClickState,
  { send, selectTarget }: StudioClickHandlers,
): (hit: StudioHit | null) => void {
  return useCallback(
    (hit: StudioHit | null) => {
      const result = studioClickInput(hit, state)
      if (result === null) return
      if (result !== 'selectTarget') {
        send(result)
        return
      }
      if (hit?.kind === 'actor' || hit?.kind === 'staff') selectTarget(hit)
    },
    [state, send, selectTarget],
  )
}
