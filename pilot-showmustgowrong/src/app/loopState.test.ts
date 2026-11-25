import {
  AD_BREAK_REAL_SECONDS,
  AUTO_SLOWMO_REAL_SECONDS,
  INTERVENTION_REAL_SECONDS,
  MAX_STEPS_PER_FRAME,
  STEP_SECONDS,
} from '@/content/balance'
import type {
  ActorView,
  AutoSlowmo,
  BroadcastInput,
  BroadcastView,
  Phase,
} from '@/sim/engineTypes'
import { BroadcastLoop, type LoopBroadcast } from './loopState'

const FRAME = STEP_SECONDS

function actor(id: string, overrides: Partial<ActorView> = {}): ActorView {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    angle: 0,
    pose: 'idle',
    onAir: false,
    walkedOut: false,
    departed: false,
    directivesLeft: 3,
    ...overrides,
  }
}

/** 스텝마다 받은 입력을 기록하는 가짜 방송. ad 입력을 받으면 광고 phase로 바뀐다(Ruling 4). */
type FakeView = Pick<BroadcastView, 'phase' | 'autoSlowmo' | 'actors'>

class FakeBroadcast implements LoopBroadcast<FakeView> {
  phase: Phase = 'live'
  autoSlowmo: AutoSlowmo | null = null
  actors: ActorView[] = [actor('rex'), actor('priya')]
  readonly steps: BroadcastInput[][] = []
  resumeCount = 0

  step(inputs: readonly BroadcastInput[] = []): void {
    if (this.phase !== 'live') return
    this.steps.push([...inputs])
    if (inputs.some((input) => input.type === 'ad')) this.phase = 'adBreak'
  }

  resumeFromAd(): void {
    this.phase = 'live'
    this.resumeCount += 1
  }

  view(): FakeView {
    return { phase: this.phase, autoSlowmo: this.autoSlowmo, actors: this.actors.map((a) => ({ ...a })) }
  }
}

interface Frameable {
  frame(realSeconds: number): unknown
}

function runFrames(loop: Frameable, count: number, seconds = FRAME): void {
  for (let index = 0; index < count; index++) loop.frame(seconds)
}

function runSeconds(loop: Frameable, seconds: number): void {
  runFrames(loop, Math.round(seconds / FRAME))
}

const SWITCH: BroadcastInput = { type: 'switch', cameraId: 'close' }
const DIRECT: BroadcastInput = { type: 'direct', actorId: 'rex', directiveId: 'stepUp' }

function setup() {
  const broadcast = new FakeBroadcast()
  const loop = new BroadcastLoop(broadcast)
  return { broadcast, loop }
}

describe('BroadcastLoop 속도', () => {
  it('평상시에는 실제 1초에 60스텝을 돈다', () => {
    const { broadcast, loop } = setup()
    runFrames(loop, 60)
    expect(broadcast.steps).toHaveLength(60)
    expect(loop.snapshot().slowmo).toBe('none')
  })

  it('프레임이 크게 끊겨도 한 프레임에 MAX_STEPS_PER_FRAME까지만 돈다', () => {
    const { broadcast, loop } = setup()
    loop.frame(30)
    expect(broadcast.steps).toHaveLength(MAX_STEPS_PER_FRAME)
  })

  it('긴 프레임 하나로 개입 시간이 한꺼번에 끝나지 않는다', () => {
    const { loop } = setup()
    loop.openIntervention()
    loop.frame(30)
    expect(loop.snapshot().interventionOpen).toBe(true)
  })
})

describe('BroadcastLoop 입력', () => {
  it('입력은 다음 스텝에 한 번만 들어간다', () => {
    const { broadcast, loop } = setup()
    loop.send(SWITCH)
    runFrames(loop, 2)
    expect(broadcast.steps).toEqual([[SWITCH], []])
  })

  it('이번 프레임에 스텝이 없으면 입력은 다음 스텝까지 기다린다', () => {
    const { broadcast, loop } = setup()
    loop.openIntervention()
    loop.send(SWITCH)
    loop.frame(FRAME)
    expect(broadcast.steps).toHaveLength(0)
    runFrames(loop, 5)
    expect(broadcast.steps[0]).toEqual([SWITCH])
  })
})

describe('BroadcastLoop 개입', () => {
  it('개입 중에는 INTERVENTION_SPEED로 느려지고 남은 시간이 줄어든다', () => {
    const { broadcast, loop } = setup()
    loop.openIntervention()
    expect(loop.snapshot()).toMatchObject({
      slowmo: 'intervention',
      interventionOpen: true,
      interventionSecondsLeft: INTERVENTION_REAL_SECONDS,
    })
    runSeconds(loop, 1)
    // 0.2배속이면 실제 1초에 12스텝
    expect(broadcast.steps).toHaveLength(12)
    expect(loop.snapshot().interventionSecondsLeft).toBeCloseTo(INTERVENTION_REAL_SECONDS - 1, 5)
  })

  it('시간이 다 되면 지시 없이 닫히고 개입으로 세지 않는다', () => {
    const { broadcast, loop } = setup()
    loop.openIntervention()
    runSeconds(loop, INTERVENTION_REAL_SECONDS + 0.1)
    const snapshot = loop.snapshot()
    expect(snapshot.interventionOpen).toBe(false)
    expect(snapshot.slowmo).toBe('none')
    expect(snapshot.interventionsIssued).toBe(0)
    expect(broadcast.steps.every((inputs) => inputs.length === 0)).toBe(true)
  })

  it('지시를 내리면 개입이 닫히고 개입으로 센다', () => {
    const { broadcast, loop } = setup()
    loop.openIntervention()
    loop.send(DIRECT)
    expect(loop.snapshot()).toMatchObject({ interventionOpen: false, interventionsIssued: 1 })
    runFrames(loop, 1)
    expect(broadcast.steps[0]).toEqual([DIRECT])
  })

  it('카메라 전환은 개입을 닫지 않는다', () => {
    const { loop } = setup()
    loop.openIntervention()
    loop.send(SWITCH)
    expect(loop.snapshot().interventionOpen).toBe(true)
  })

  it('이미 열린 개입을 다시 열면(다른 대상 클릭) 남은 시간을 그대로 둔다', () => {
    const { loop } = setup()
    loop.openIntervention()
    runSeconds(loop, 1)
    const left = loop.snapshot().interventionSecondsLeft
    loop.openIntervention()
    expect(loop.snapshot().interventionSecondsLeft).toBe(left)
    expect(left).toBeCloseTo(INTERVENTION_REAL_SECONDS - 1, 5)
  })

  it('직접 닫으면 개입으로 세지 않는다', () => {
    const { loop } = setup()
    loop.openIntervention()
    loop.closeIntervention()
    expect(loop.snapshot()).toMatchObject({ interventionOpen: false, interventionsIssued: 0 })
  })
})

describe('BroadcastLoop 입력 재검증(Ruling 35)', () => {
  it('큐에 쌓인 지시가 그사이 이탈한 출연자를 가리키면 넘기기 전에 버린다', () => {
    const { broadcast, loop } = setup()
    loop.openIntervention()
    loop.send(DIRECT)
    loop.send(SWITCH)
    broadcast.actors = [actor('rex', { walkedOut: true }), actor('priya')]
    // 느려진 상태가 아니므로 다음 프레임에 한 스텝. 그 전에 최신 view를 읽도록 한 프레임을 0초로 돌린다.
    loop.frame(0)
    loop.frame(FRAME)
    expect(broadcast.steps[0]).toEqual([SWITCH])
  })

  it('물리에서 빠진(departed) 출연자에게 간 지시도 버리고, 무대에 있는 출연자 지시는 그대로 넘긴다', () => {
    const { broadcast, loop } = setup()
    const toPriya: BroadcastInput = { type: 'direct', actorId: 'priya', directiveId: 'laughBig' }
    loop.send(DIRECT)
    loop.send(toPriya)
    broadcast.actors = [actor('rex', { walkedOut: true, departed: true }), actor('priya')]
    loop.frame(0)
    loop.frame(FRAME)
    expect(broadcast.steps[0]).toEqual([toPriya])
  })
})

describe('BroadcastLoop 자동 슬로모션', () => {
  it('새 계기(autoSlowmo.step 변화)에만 AUTO_SLOWMO_REAL_SECONDS 동안 느려진다', () => {
    const { broadcast, loop } = setup()
    broadcast.autoSlowmo = { gauge: null, eventId: 1, step: 10 }
    loop.frame(FRAME)
    expect(loop.snapshot().slowmo).toBe('auto')
    runSeconds(loop, AUTO_SLOWMO_REAL_SECONDS + 0.1)
    // 같은 계기를 계속 들고 있어도 다시 느려지지 않는다
    expect(loop.snapshot().slowmo).toBe('none')

    broadcast.autoSlowmo = { gauge: 'violence', eventId: 2, step: 200 }
    loop.frame(FRAME)
    expect(loop.snapshot().slowmo).toBe('auto')
  })

  it('자동 슬로모션 중에는 INTERVENTION_SPEED로 돈다', () => {
    const { broadcast, loop } = setup()
    broadcast.autoSlowmo = { gauge: null, eventId: 1, step: 0 }
    loop.frame(FRAME)
    const before = broadcast.steps.length
    runSeconds(loop, 1)
    expect(broadcast.steps.length - before).toBe(12)
  })

  it('개입을 열면 표시는 개입이 앞선다', () => {
    const { broadcast, loop } = setup()
    broadcast.autoSlowmo = { gauge: null, eventId: 1, step: 0 }
    loop.frame(FRAME)
    loop.openIntervention()
    expect(loop.snapshot().slowmo).toBe('intervention')
  })
})

describe('BroadcastLoop 광고', () => {
  it('광고 패널을 여는 동안은 INTERVENTION_SPEED로 느려지고 시간 제한이 없다', () => {
    const { broadcast, loop } = setup()
    loop.openAdPanel()
    runSeconds(loop, 10)
    expect(loop.snapshot()).toMatchObject({ adPanelOpen: true, slowmo: 'intervention' })
    expect(broadcast.steps).toHaveLength(120)
  })

  it('광고 패널은 취소할 수 있다', () => {
    const { loop } = setup()
    loop.openAdPanel()
    loop.cancelAdPanel()
    expect(loop.snapshot()).toMatchObject({ adPanelOpen: false, slowmo: 'none' })
  })

  it('개입 중에 광고 패널을 열면 개입은 세지 않고 닫힌다', () => {
    const { loop } = setup()
    loop.openIntervention()
    loop.openAdPanel()
    expect(loop.snapshot()).toMatchObject({
      interventionOpen: false,
      adPanelOpen: true,
      interventionsIssued: 0,
    })
  })

  it('광고 패널이나 광고 중에는 개입을 열 수 없다', () => {
    const { loop } = setup()
    loop.openAdPanel()
    loop.openIntervention()
    expect(loop.snapshot().interventionOpen).toBe(false)
  })

  it('효과를 확정하면 ad 입력을 보내고 광고 중에는 스텝을 돌리지 않다가 끝나면 resumeFromAd를 부른다', () => {
    const { broadcast, loop } = setup()
    loop.openAdPanel()
    loop.confirmAd(['relief', 'reset'])
    expect(loop.snapshot().adPanelOpen).toBe(false)
    loop.frame(FRAME)
    expect(broadcast.steps).toEqual([[{ type: 'ad', effects: ['relief', 'reset'] }]])
    expect(loop.snapshot()).toMatchObject({
      adBreak: true,
      adBreakSecondsLeft: AD_BREAK_REAL_SECONDS,
    })

    runSeconds(loop, AD_BREAK_REAL_SECONDS - 0.5)
    expect(broadcast.steps).toHaveLength(1)
    expect(loop.snapshot().adBreak).toBe(true)
    loop.openIntervention()
    expect(loop.snapshot().interventionOpen).toBe(false)

    runSeconds(loop, 1)
    expect(broadcast.resumeCount).toBe(1)
    expect(loop.snapshot().adBreak).toBe(false)
    runFrames(loop, 3)
    expect(broadcast.steps.length).toBeGreaterThan(1)
  })

  it('확정한 광고가 들어가기 전에는 광고 패널을 다시 열 수 없다', () => {
    const { loop } = setup()
    loop.confirmAd(['relief', 'reset'])
    loop.openAdPanel()
    expect(loop.snapshot().adPanelOpen).toBe(false)
  })
})

describe('BroadcastLoop 종료', () => {
  it('방송이 끝나면 열려 있던 개입을 닫고 더 돌지 않는다', () => {
    const { broadcast, loop } = setup()
    loop.openIntervention()
    broadcast.phase = 'ended'
    loop.frame(FRAME)
    expect(loop.snapshot()).toMatchObject({ interventionOpen: false, ended: true })
    loop.openIntervention()
    expect(loop.snapshot().interventionOpen).toBe(false)
    expect(broadcast.steps).toHaveLength(0)
  })
})
