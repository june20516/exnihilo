import { STEP_SECONDS } from '@/content/balance'
import type { ReactionDef } from '@/content/types'
import type { Cast, CastMember } from './cast'
import type { Vec3 } from './vec'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)

export interface GazeCandidate {
  member: CastMember
  /** 정의 순서대로, 지금 발동 조건을 만족하는 gaze 반응들 */
  reactions: ReactionDef[]
}

/**
 * 이번 스텝의 송출 화면을 기준으로 출연자별 시선 상태(wasOnAir, absentSteps)를 갱신하고
 * 발동 조건을 만족한 gaze 반응을 돌려준다. 쿨다운과 확률, 실행은 엔진이 맡는다.
 * - enter: 직전 스텝에 화면 밖이었다가 이번에 화면 안
 * - absentFor: 화면 밖 연속 시간이 seconds의 배수가 될 때마다
 */
export function updateGaze(cast: Cast, isOnAir: (point: Vec3) => boolean): GazeCandidate[] {
  const candidates: GazeCandidate[] = []
  for (const member of cast.active()) {
    const onAir = isOnAir(cast.position(member))
    const entered = onAir && !member.wasOnAir
    member.wasOnAir = onAir
    member.absentSteps = onAir ? 0 : member.absentSteps + 1

    const reactions = member.def.reactions.filter(({ trigger }) => {
      if (trigger.kind !== 'gaze') return false
      if (trigger.when === 'enter') return entered
      const period = Math.max(1, Math.round(trigger.seconds * STEPS_PER_SECOND))
      return member.absentSteps > 0 && member.absentSteps % period === 0
    })
    if (reactions.length > 0) candidates.push({ member, reactions })
  }
  return candidates
}
