import { useEffect, type RefObject } from 'react'
import type { ActorView } from '@/sim/engineTypes'
import type { InterventionTarget } from './interventionTargets'

/** 판단 카드가 가리킬 수 있는 대상. 고른 출연자가 이탈했거나 화면에 없으면 null(대상 목록에서 빠지기 때문) */
export function liveSelectedTarget(
  selected: InterventionTarget | null,
  actors: readonly ActorView[] | undefined,
): InterventionTarget | null {
  if (selected === null || selected.kind !== 'performer') return selected
  const actor = actors?.find((candidate) => candidate.id === selected.id)
  return actor === undefined || actor.walkedOut || actor.departed ? null : selected
}

/** 스튜디오에서 밝게 남길 출연자 id. 개입 중 출연자를 골랐을 때만 있고, 스태프나 미선택이면 null */
export function focusedActorId(interventionOpen: boolean, live: InterventionTarget | null): string | null {
  return interventionOpen && live?.kind === 'performer' ? live.id : null
}

/** setFocus를 가진 렌더러의 최소 모양 */
export interface FocusableRenderer {
  setFocus(actorId: string | null): void
}

/** 초점 id가 바뀔 때마다 렌더러에 알린다. 개입이 끝나 id가 null이 되면 원래대로 돌아온다 */
export function useStudioFocus(rendererRef: RefObject<FocusableRenderer | null>, actorId: string | null): void {
  useEffect(() => {
    rendererRef.current?.setFocus(actorId)
  }, [rendererRef, actorId])
}
