import { AD_EFFECT_PICKS, TOLERANCE_COUNT } from '@/content/balance'
import type { CameraDef, StaffDef } from '@/content/types'
import type { Cast } from './cast'
import type { Director } from './director'
import type { BroadcastInput } from './engineTypes'

interface InputValidationDeps {
  cast: Cast
  staff: ReadonlyMap<string, StaffDef>
  director: Director
  cameras: ReadonlyMap<string, CameraDef>
  /** 아직 투입하지 않은 대기 출연자 수 */
  benchLeft: number
}

/**
 * Ruling 20: 입력 묶음 전체를 적용 전에 검증한다. 하나라도 틀리면 throw하므로
 * 엔진은 아무것도 바꾸지 않은 채로 남는다. 같은 묶음 안에서 앞선 지시로 이탈하거나
 * 광고를 쓰는 것도 센다.
 */
export function validateInputs(inputs: readonly BroadcastInput[], deps: InputValidationDeps): void {
  const directed = new Map<string, number>()
  let adsTaken = 0
  for (const input of inputs) {
    switch (input.type) {
      case 'switch':
        if (!deps.cameras.has(input.cameraId)) {
          throw new Error(`알 수 없는 카메라입니다: ${input.cameraId}`)
        }
        break
      case 'direct': {
        // 지금 무대에 있는 출연자만 받는다. 같은 묶음의 광고 setup으로 들어올 대기 출연자에게
        // 내리는 지시도 여기서 거부한다(검증을 적용 전에 한 번에 끝내 원자성을 지키기 위함).
        const member = deps.cast.get(input.actorId)
        if (member === undefined) throw new Error(`무대에 없는 출연자입니다: ${input.actorId}`)
        if (!member.def.directives.some(({ id }) => id === input.directiveId)) {
          throw new Error(`출연자 ${input.actorId}에게 없는 지시입니다: ${input.directiveId}`)
        }
        // 내성을 넘는 지시가 이탈을 부르므로, 그보다 더 받은 출연자는 이미 이탈한 것이다.
        const directedInBatch = directed.get(input.actorId) ?? 0
        const usedBefore = deps.director.directivesUsed(input.actorId) + directedInBatch
        if (usedBefore > TOLERANCE_COUNT[member.def.tolerance]) {
          throw new Error(`이미 이탈한 출연자에게 지시했습니다: ${input.actorId}`)
        }
        directed.set(input.actorId, directedInBatch + 1)
        break
      }
      case 'directStaff': {
        const member = deps.staff.get(input.staffId)
        if (member === undefined) throw new Error(`알 수 없는 스태프입니다: ${input.staffId}`)
        if (!member.directives.some(({ id }) => id === input.directiveId)) {
          throw new Error(`스태프 ${input.staffId}에게 없는 지시입니다: ${input.directiveId}`)
        }
        break
      }
      case 'ad': {
        const { effects } = input
        if (effects.length !== AD_EFFECT_PICKS) {
          throw new Error(`광고 효과는 ${AD_EFFECT_PICKS}개를 골라야 합니다: ${effects.length}개`)
        }
        if (new Set(effects).size !== effects.length) {
          throw new Error(`같은 광고 효과를 두 번 고를 수 없습니다: ${effects.join(', ')}`)
        }
        adsTaken += 1
        if (adsTaken > deps.director.adsLeft) throw new Error('남은 광고가 없습니다.')
        // Ruling 21: 대기 출연자가 없으면 외적 세팅을 고를 수 없다.
        if (effects.includes('setup') && deps.benchLeft === 0) {
          throw new Error('투입할 대기 출연자가 없습니다.')
        }
        break
      }
    }
  }
}
