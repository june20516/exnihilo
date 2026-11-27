import type { ActorView } from '@/sim/engineTypes'
import type { HoverAnchor } from './hoverTipContent'

/**
 * 지금도 유효한 고정 카드 자리. 개입이 시작되면 고정은 풀리고(개입이 끝나도 되살리지 않는다는 판정은
 * 호출자가 개입 시작 때 상태를 비워서 지킨다), 고정한 출연자가 이탈했으면 없는 것으로 친다.
 */
export function livePinnedAnchor(
  pinned: HoverAnchor | null,
  actors: readonly ActorView[] | undefined,
  interventionOpen: boolean,
): HoverAnchor | null {
  if (pinned === null || interventionOpen) return null
  if (pinned.hit.kind !== 'actor') return pinned
  const { id } = pinned.hit
  return actors?.find((actor) => actor.id === id)?.walkedOut === true ? null : pinned
}
