import { afterEach, describe, expect, it, vi } from 'vitest'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastInput } from './engine'

// 스태프 지시의 엇나감 확률은 min(MISFIRE_CAP, 직전 스태프 피로 × STAFF_FATIGUE_MISFIRE_PER_POINT)다.
// 두 수치를 1로 두면 두 번째 스태프 지시(직전 피로 1)부터는 시드와 관계없이 항상 엇나간다(roll < 1).
vi.mock('@/content/balance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/content/balance')>()),
  MISFIRE_CAP: 1,
  STAFF_FATIGUE_MISFIRE_PER_POINT: 1,
}))

const [operator] = LINEUP.staff

const opened: Broadcast[] = []

afterEach(() => {
  for (const broadcast of opened.splice(0)) broadcast.dispose()
})

describe('엇나간 스태프 지시', () => {
  it('엇나간 지시로 생긴 놀람도 놀람 로그를 남긴다(R8)', async () => {
    // 반응을 모두 지워 반응 놀람이 생기지 않게 한다. startled는 엇나간 지시에서만 나온다.
    const broadcast = await Broadcast.create({
      show: TALK_SHOW,
      performers: LINEUP.performers.map((performer) => ({ ...performer, reactions: [] })),
      bench: [],
      staff: [{ ...operator, reactions: [] }],
      equipment: [],
      seed: 7,
    })
    opened.push(broadcast)
    const calmDown: BroadcastInput = {
      type: 'directStaff',
      staffId: operator.id,
      directiveId: 'calmDown',
    }

    // 첫 지시는 직전 피로가 0이라 엇나가지 않는다.
    broadcast.step([calmDown])
    expect(broadcast.view().staff[0].mode).toBe('normal')

    broadcast.step([calmDown])
    const view = broadcast.view()
    expect(view.staff[0].mode).toBe('startled')
    expect(view.log.filter((line) => line.step === 1)).toEqual([
      expect.objectContaining({ text: '카메라 감독이 놀라 카메라를 휘둘렀다', depth: 1 }),
    ])
  })
})
