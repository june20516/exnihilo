import { beforeAll, describe, expect, it } from 'vitest'
import { AUTO_SHOT_BODY_SECONDS, STEP_SECONDS } from '@/content/balance'
import type { Intensity } from '@/content/types'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { AutoDirector } from './autoDirector'
import { Broadcast, type BroadcastInput, type BroadcastView, type RecentPhenomenon } from './engine'
import { measureFinishedBroadcast } from './livingMetrics'

const STEPS_PER_SECOND = Math.round(1 / STEP_SECONDS)
const seconds = (value: number) => Math.round(value * STEPS_PER_SECOND)
/** 평소 컷 길이(조정값, 몸 초) */
const SHOT = seconds(AUTO_SHOT_BODY_SECONDS)
const ORDER = ['rex', 'priya', 'okafor', 'mo']

let baseView: BroadcastView

beforeAll(async () => {
  const broadcast = await Broadcast.create({
    show: TALK_SHOW,
    ...LINEUP,
    seed: 1,
  })
  try {
    baseView = broadcast.view()
  } finally {
    broadcast.dispose()
  }
})

interface ViewOptions {
  onAir?: string
  closeTarget?: string | null
  phase?: BroadcastView['phase']
  walkedOut?: string[]
  phenomena?: RecentPhenomenon[]
}

/** 엔진 view에서 자동 PD가 읽는 필드만 바꿔 만든다 */
function viewAt(step: number, options: ViewOptions = {}): BroadcastView {
  const { onAir = 'wide', closeTarget = null, phase = 'live', walkedOut = [], phenomena = [] } = options
  return {
    ...baseView,
    step,
    phase,
    onAirCameraId: onAir,
    cameraTargets: { wide: null, close: closeTarget, audienceCam: null },
    actors: baseView.actors.map((actor) => ({
      ...actor,
      walkedOut: walkedOut.includes(actor.id),
    })),
    recentPhenomena: phenomena,
  }
}

function phenomenon(id: number, sourceId: string, overrides: Partial<RecentPhenomenon> = {}): RecentPhenomenon {
  return {
    id,
    kind: 'noise',
    intensity: 1,
    sourceId,
    targetId: null,
    x: 0,
    y: 0,
    z: 0,
    ageSeconds: 0,
    text: '',
    ...overrides,
  }
}

/** 기척(강도 0). 타입상 현상 강도는 1 이상이지만 자동 PD는 0도 무시한다 */
const NO_SIGN = 0 as unknown as Intensity
const SWITCH = (cameraId: string): BroadcastInput => ({
  type: 'switch',
  cameraId,
})
const TRACK = (actorId: string): BroadcastInput => ({
  type: 'track',
  cameraId: 'close',
  actorId,
})

function newDirector(): AutoDirector {
  return new AutoDirector(TALK_SHOW, ORDER)
}

describe('AutoDirector 평소 순서', () => {
  it('평소에는 컷 길이마다 와이드→클로즈업(첫 출연자)→와이드→관객석 순서로 넘긴다', () => {
    const director = newDirector()
    expect(director.decide(viewAt(0, { onAir: 'wide' }))).toEqual([])
    expect(director.decide(viewAt(SHOT, { onAir: 'wide' }))).toEqual([TRACK('rex'), SWITCH('close')])
    expect(director.decide(viewAt(SHOT * 2, { onAir: 'close', closeTarget: 'rex' }))).toEqual([SWITCH('wide')])
    expect(director.decide(viewAt(SHOT * 3, { onAir: 'wide', closeTarget: 'rex' }))).toEqual([SWITCH('audienceCam')])
  })

  it('컷 길이가 지나기 전에는 아무것도 내지 않는다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    expect(director.decide(viewAt(SHOT - 1))).toEqual([])
  })

  it('처음 부를 때 송출이 첫 칸과 다르면 첫 칸으로 바꾼다', () => {
    expect(newDirector().decide(viewAt(0, { onAir: 'audienceCam' }))).toEqual([SWITCH('wide')])
  })

  it('몇 스텝마다 불러도 잡은 시간은 호출 횟수가 아니라 step 차이로 잰다', () => {
    const director = newDirector()
    const firstInputStep = (() => {
      for (let step = 0; step < SHOT * 2; step += 7) {
        if (director.decide(viewAt(step)).length > 0) return step
      }
      return -1
    })()
    expect(firstInputStep).toBe(Math.ceil(SHOT / 7) * 7)
  })

  it('클로즈업 차례마다 다음 출연자, 이탈한 출연자는 건너뛴다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    expect(director.decide(viewAt(SHOT * 1))).toEqual([TRACK('rex'), SWITCH('close')])
    director.decide(viewAt(SHOT * 2, { onAir: 'close', closeTarget: 'rex' }))
    director.decide(viewAt(SHOT * 3, { onAir: 'wide', closeTarget: 'rex' }))
    // 두 번째 클로즈업 차례: 프리야가 이탈해 오카포를 잡는다
    director.decide(
      viewAt(SHOT * 4, {
        onAir: 'audienceCam',
        closeTarget: 'rex',
        walkedOut: ['priya'],
      }),
    )
    expect(
      director.decide(
        viewAt(SHOT * 5, {
          onAir: 'wide',
          closeTarget: 'rex',
          walkedOut: ['priya'],
        }),
      ),
    ).toEqual([TRACK('okafor'), SWITCH('close')])
  })

  it('모든 출연자가 이탈하면 클로즈업 차례를 건너뛴다', () => {
    const director = newDirector()
    director.decide(viewAt(0, { walkedOut: ORDER }))
    // 클로즈업 칸을 건너뛰고 그다음 칸(와이드)으로 간다. 이미 와이드라 입력이 없다
    expect(director.decide(viewAt(SHOT, { onAir: 'wide', walkedOut: ORDER }))).toEqual([])
    expect(director.decide(viewAt(SHOT * 2, { onAir: 'wide', walkedOut: ORDER }))).toEqual([SWITCH('audienceCam')])
  })

  /** rotation이 클로즈업(추적 카메라) 하나뿐인 쇼 */
  const closeOnlyShow = { ...TALK_SHOW, autoCut: { ...TALK_SHOW.autoCut, rotation: ['close'] } }

  it('rotation이 추적 카메라뿐이고 처음 부를 때 활동 출연자가 없으면 잡을 컷이 없어 오류다', () => {
    const director = new AutoDirector(closeOnlyShow, ORDER)
    expect(() => director.decide(viewAt(0, { walkedOut: ORDER }))).toThrow('컷을 잡기 전')
  })

  it('rotation이 추적 카메라뿐인데 컷을 잡은 뒤 모두 이탈하면 지금 컷을 이어 가고 시간을 다시 센다', () => {
    const director = new AutoDirector(closeOnlyShow, ORDER)
    expect(director.decide(viewAt(0))).toEqual([TRACK('rex'), SWITCH('close')])
    const onClose = { onAir: 'close', closeTarget: 'rex', walkedOut: ORDER }
    // 쓸 칸이 없어 입력이 없다. 잡은 시간은 SHOT부터 다시 센다
    expect(director.decide(viewAt(SHOT, onClose))).toEqual([])
    expect(director.decide(viewAt(SHOT * 2 - 1, onClose))).toEqual([])
    // 다시 센 시간이 컷 길이를 넘으면 또 칸을 찾는다. 대상 출연자가 돌아왔으면 그 출연자를 잡는다
    expect(director.decide(viewAt(SHOT * 2, { onAir: 'close', closeTarget: 'rex' }))).toEqual([TRACK('priya')])
  })

  it('광고 중에는 아무것도 내지 않는다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    expect(director.decide(viewAt(SHOT, { phase: 'adBreak' }))).toEqual([])
    expect(director.decide(viewAt(SHOT * 2, { phase: 'ended' }))).toEqual([])
  })
})

describe('AutoDirector 사고', () => {
  /** 0에서 시작해 step 200에 프리야 사고로 클로즈업이 된 상태 */
  function afterPriyaIncident(): AutoDirector {
    const director = newDirector()
    director.decide(viewAt(0))
    director.decide(viewAt(199))
    expect(director.decide(viewAt(200, { phenomena: [phenomenon(1, 'priya')] }))).toEqual([
      TRACK('priya'),
      SWITCH('close'),
    ])
    return director
  }

  it('출연자 사고가 나면 그 출연자를 잡는 클로즈업으로 넘긴다', () => {
    afterPriyaIncident()
  })

  it('같은 출연자가 또 사고를 내면 컷을 유지하고 시간을 다시 센다', () => {
    const director = afterPriyaIncident()
    const onClose = { onAir: 'close', closeTarget: 'priya' }
    expect(
      director.decide(
        viewAt(260, {
          ...onClose,
          phenomena: [phenomenon(1, 'priya'), phenomenon(2, 'priya')],
        }),
      ),
    ).toEqual([])
    // 처음 사고 기준(200 + 300)에는 넘기지 않고, 다시 센 기준(260 + 300)에 넘긴다
    expect(director.decide(viewAt(200 + SHOT, onClose))).toEqual([])
    expect(director.decide(viewAt(260 + SHOT, onClose))).toEqual([TRACK('rex')])
  })

  it('다른 출연자 사고는 1.5초를 잡은 뒤에 옮긴다', () => {
    const director = afterPriyaIncident()
    const onClose = { onAir: 'close', closeTarget: 'priya' }
    const rex = phenomenon(2, 'rex')
    expect(director.decide(viewAt(200 + seconds(0.5), { ...onClose, phenomena: [rex] }))).toEqual([])
    expect(director.decide(viewAt(200 + seconds(1.5) - 1, onClose))).toEqual([])
    expect(director.decide(viewAt(200 + seconds(1.5), onClose))).toEqual([TRACK('rex')])
  })

  it('기다리는 동안 더 새 사고가 오면 더 새 것으로 옮긴다', () => {
    const director = afterPriyaIncident()
    const onClose = { onAir: 'close', closeTarget: 'priya' }
    director.decide(viewAt(230, { ...onClose, phenomena: [phenomenon(2, 'rex')] }))
    director.decide(
      viewAt(250, {
        ...onClose,
        phenomena: [phenomenon(2, 'rex'), phenomenon(3, 'okafor')],
      }),
    )
    expect(director.decide(viewAt(200 + seconds(1.5), onClose))).toEqual([TRACK('okafor')])
  })

  it('장비 사고는 와이드로 넘긴다', () => {
    const director = afterPriyaIncident()
    const input = director.decide(
      viewAt(200 + seconds(2), {
        onAir: 'close',
        closeTarget: 'priya',
        phenomena: [phenomenon(2, 'overheatedLight', { kind: 'impact' })],
      }),
    )
    expect(input).toEqual([SWITCH('wide')])
  })

  it('관객 사고도 와이드로 넘긴다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    director.decide(viewAt(SHOT, { onAir: 'wide' }))
    // 평소 순서 전환(SHOT * 2)과 겹치지 않는 시점
    const input = director.decide(
      viewAt(SHOT + seconds(2), {
        onAir: 'close',
        closeTarget: 'rex',
        phenomena: [phenomenon(1, 'audience')],
      }),
    )
    expect(input).toEqual([SWITCH('wide')])
  })

  it('클로즈업 대상이 이미 그 출연자이고 송출만 다르면 switch만 낸다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    expect(
      director.decide(viewAt(200, { onAir: 'wide', closeTarget: 'priya', phenomena: [phenomenon(1, 'priya')] })),
    ).toEqual([SWITCH('close')])
  })

  it('같은 대상 사고에서 바깥이 송출을 바꿔 두었으면 사고 컷으로 돌려놓는다', () => {
    const director = afterPriyaIncident()
    const moved = { onAir: 'wide', closeTarget: 'rex', phenomena: [phenomenon(2, 'priya')] }
    expect(director.decide(viewAt(260, moved))).toEqual([TRACK('priya'), SWITCH('close')])
  })

  it('기다리는 사고의 대상이 이탈하면 그 사고를 버린다', () => {
    const director = afterPriyaIncident()
    const onClose = { onAir: 'close', closeTarget: 'priya' }
    director.decide(viewAt(230, { ...onClose, phenomena: [phenomenon(2, 'rex')] }))
    expect(director.decide(viewAt(200 + seconds(1.5), { ...onClose, walkedOut: ['rex'] }))).toEqual([])
  })

  it('광고 중에 난 현상은 광고 뒤에 사고로 치지 않는다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    director.decide(viewAt(100, { phase: 'adBreak', phenomena: [phenomenon(1, 'priya')] }))
    expect(director.decide(viewAt(200, { phenomena: [phenomenon(1, 'priya')] }))).toEqual([])
  })

  it('기척(강도 0)은 무시한다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    expect(director.decide(viewAt(200, { phenomena: [phenomenon(1, 'priya', { intensity: NO_SIGN })] }))).toEqual([])
  })

  it('방송 정적은 사고가 아니다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    const silence = phenomenon(1, 'broadcast', {
      kind: 'silence',
      intensity: 2,
    })
    expect(director.decide(viewAt(200, { phenomena: [silence] }))).toEqual([])
  })

  it('이미 본 사고는 다시 반응하지 않는다', () => {
    const director = afterPriyaIncident()
    const onClose = { onAir: 'close', closeTarget: 'priya' }
    expect(director.decide(viewAt(400, { ...onClose, phenomena: [phenomenon(1, 'priya')] }))).toEqual([])
  })

  it('사고 컷이 컷 길이를 넘기면 사고 전 순서의 다음 칸으로 돌아간다', () => {
    const director = newDirector()
    director.decide(viewAt(0))
    // 순서 0(와이드)에서 사고 → 클로즈업 사고 컷. 끝나면 순서 1(클로즈업, 첫 출연자)로 간다
    director.decide(viewAt(200, { phenomena: [phenomenon(1, 'priya')] }))
    expect(director.decide(viewAt(200 + SHOT, { onAir: 'close', closeTarget: 'priya' }))).toEqual([TRACK('rex')])
  })

  it('같은 입력 열을 먹이면 같은 결과를 낸다', () => {
    const views = [
      viewAt(0),
      viewAt(200, { phenomena: [phenomenon(1, 'rex')] }),
      viewAt(500, { onAir: 'close', closeTarget: 'rex' }),
    ]
    const run = () => {
      const director = newDirector()
      return views.map((view) => director.decide(view))
    }
    expect(run()).toEqual(run())
  })
})

describe('AutoDirector 결정론', () => {
  /** intervalSteps마다 decide를 부른다(sim은 6스텝 = 몸 0.1초) */
  async function measureWithAutoDirector(seed: number, intervalSteps = 1) {
    const broadcast = await Broadcast.create({
      show: TALK_SHOW,
      ...LINEUP,
      seed,
    })
    try {
      const director = new AutoDirector(
        TALK_SHOW,
        LINEUP.performers.map((performer) => performer.id),
      )
      while (broadcast.phase === 'live') {
        const turn = broadcast.currentStep % intervalSteps === 0
        broadcast.step(turn ? director.decide(broadcast.view()) : [])
      }
      return measureFinishedBroadcast(broadcast, LINEUP.performers)
    } finally {
      broadcast.dispose()
    }
  }

  it('실제 라인업 시드 3 방송을 자동 PD로 두 번 돌린 지표가 같다', async () => {
    const first = await measureWithAutoDirector(3)
    const second = await measureWithAutoDirector(3)
    expect(second).toEqual(first)
    expect(first.lineCount).toBeGreaterThan(0)
  }, 30_000)

  it('sim처럼 6스텝(몸 0.1초)마다 불러도 시드 3 방송 두 번의 지표가 같다', async () => {
    const first = await measureWithAutoDirector(3, 6)
    const second = await measureWithAutoDirector(3, 6)
    expect(second).toEqual(first)
    expect(first.lineCount).toBeGreaterThan(0)
  }, 30_000)
})
