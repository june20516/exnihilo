import type { ActorView, BroadcastView } from '@/sim/engineTypes'
import { TrendRecorder } from './trendRecorder'

function actor(id: string, value: number | null, walkedOut = false): ActorView {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    z: 0,
    up: { x: 0, y: 1, z: 0 },
    pose: 'idle',
    onAir: true,
    walkedOut,
    departed: false,
    directivesLeft: 3,
    mood: null,
    emotions: value === null ? [] : [{ id: 'irritation', name: '짜증', value, stage: 0, rise: [50, 80], reasons: [] }],
    misfireChance: 0,
    takeover: null,
    habit: null,
  }
}

function view(step: number, value: number, walkedOut = false): BroadcastView {
  return { step, actors: [actor('rex', value, walkedOut)] } as unknown as BroadcastView
}

describe('TrendRecorder', () => {
  it('30스텝마다 한 점, 같은 구간 중복 호출은 무시', () => {
    const recorder = new TrendRecorder(['rex'])
    recorder.record(view(0, 10))
    recorder.record(view(10, 20))
    recorder.record(view(29, 20))
    recorder.record(view(30, 20))
    expect(recorder.all()[0].points).toEqual([
      { step: 0, value: 10 },
      { step: 30, value: 20 },
    ])
  })

  it('스텝이 건너뛰면 건너뛴 칸을 지금 값으로 채운다', () => {
    const recorder = new TrendRecorder(['rex'])
    recorder.record(view(0, 10))
    recorder.record(view(95, 30))
    expect(recorder.all()[0].points.map((p) => p.step)).toEqual([0, 30, 60, 90])
    expect(recorder.all()[0].points[3].value).toBe(30)
  })

  it('window(600, 3600)은 step 0~600 점만, all()은 전부', () => {
    const recorder = new TrendRecorder(['rex'])
    for (let step = 0; step <= 900; step += 30) recorder.record(view(step, 10))
    expect(recorder.window(600, 3600)[0].points.at(-1)?.step).toBe(600)
    expect(recorder.window(600, 3600)[0].points[0].step).toBe(0)
    expect(recorder.window(600, 300)[0].points.map((p) => p.step)[0]).toBe(300)
    expect(recorder.all()[0].points).toHaveLength(31)
  })

  it('이탈한 출연자 점은 null', () => {
    const recorder = new TrendRecorder(['rex'])
    recorder.record(view(0, 10, true))
    expect(recorder.all()[0].points).toEqual([{ step: 0, value: null }])
  })
})
