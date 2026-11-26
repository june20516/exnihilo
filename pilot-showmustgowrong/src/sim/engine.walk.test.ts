import { afterEach, describe, expect, it } from 'vitest'
import { POSE_HOLD_SECONDS, STEP_SECONDS } from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastInput } from './engine'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const opened: Broadcast[] = []

afterEach(() => {
  for (const broadcast of opened.splice(0)) broadcast.dispose()
})

async function create(): Promise<Broadcast> {
  const broadcast = await Broadcast.create({ show: TALK_SHOW, ...LINEUP, seed: 1 })
  opened.push(broadcast)
  return broadcast
}

const rexOf = (broadcast: Broadcast) => {
  const rex = broadcast.view().actors.find((actor) => actor.id === 'rex')
  if (rex === undefined) throw new Error('렉스가 없습니다')
  return rex
}

function runSeconds(broadcast: Broadcast, seconds: number, first: BroadcastInput[] = []): void {
  broadcast.step(first)
  for (let step = 1; step < seconds * STEPS_PER_SECOND; step++) broadcast.step()
}

const stepUp: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'stepUp' }

describe('카메라 앞으로(onAirFrame 걷기)', () => {
  it.each([
    ['관객석 카메라', [{ type: 'switch', cameraId: 'audienceCam' }] as BroadcastInput[]],
    [
      '모를 따라가는 클로즈업',
      [
        { type: 'switch', cameraId: 'close' },
        { type: 'track', cameraId: 'close', actorId: 'mo' },
      ] as BroadcastInput[],
    ],
  ])('%s에 안 잡힌 렉스가 지시를 받으면 4초 안에 송출 화면 안으로 걸어 들어간다', async (_, setupInputs) => {
    const broadcast = await create()
    broadcast.step(setupInputs)
    expect(rexOf(broadcast).onAir).toBe(false)

    let enteredAt: number | null = null
    broadcast.step([stepUp])
    for (let step = 0; step < 4 * STEPS_PER_SECOND && enteredAt === null; step++) {
      broadcast.step()
      if (rexOf(broadcast).onAir) enteredAt = step
    }
    expect(enteredAt).not.toBeNull()
  })

  it('도착하면 멈춰 화면 안에 머문다', async () => {
    const broadcast = await create()
    broadcast.step([{ type: 'switch', cameraId: 'audienceCam' }])
    runSeconds(broadcast, 5, [stepUp])
    const arrived = rexOf(broadcast)
    runSeconds(broadcast, 2)
    const later = rexOf(broadcast)
    expect(later.onAir).toBe(true)
    expect(Math.hypot(later.x - arrived.x, later.z - arrived.z)).toBeLessThan(0.2)
  })
})

describe('렉스의 분노', () => {
  // 화면 밖 8초 반응은 주목 욕구 감정으로 옮겨져, 화난 포즈는 지시(pressGuest)로 만든다.
  it(`화난 포즈는 새 행동이 없으면 ${POSE_HOLD_SECONDS}초 뒤 평소 포즈로 돌아온다`, async () => {
    const broadcast = await create()
    broadcast.step()
    broadcast.step([{ type: 'direct', actorId: 'rex', directiveId: 'pressGuest' }])
    expect(rexOf(broadcast).pose).toBe('angry')
    runSeconds(broadcast, POSE_HOLD_SECONDS)
    expect(rexOf(broadcast).pose).toBe('idle')
  })
})
