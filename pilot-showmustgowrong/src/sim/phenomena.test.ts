import { describe, expect, it } from 'vitest'
import {
  EventLog,
  isStir,
  perceives,
  targetsSelf,
  type PhenomenonEvent,
  type Perceiver,
} from '@/sim/phenomena'

function makeEvent(overrides: Partial<PhenomenonEvent> = {}): PhenomenonEvent {
  return {
    id: 1,
    kind: 'noise',
    intensity: 1,
    sourceId: 'src',
    targetId: null,
    x: 0,
    y: 0,
    z: 0,
    step: 0,
    causeId: null,
    depth: 1,
    ...overrides,
  }
}

function makePerceiver(overrides: Partial<Perceiver> = {}): Perceiver {
  return { id: 'me', x: 0, y: 0, z: 0, inDarkness: false, ...overrides }
}

describe('perceives', () => {
  it('소음 강도 1은 3m 이내에서만 들린다', () => {
    const event = makeEvent({ kind: 'noise', intensity: 1 })
    expect(perceives(event, makePerceiver({ x: 3 }))).toBe(true)
    expect(perceives(event, makePerceiver({ x: 3.01 }))).toBe(false)
  })

  it('소음 강도 3은 12m까지 들리고, 거리는 x와 z를 함께 잰다', () => {
    const event = makeEvent({ kind: 'noise', intensity: 3 })
    expect(perceives(event, makePerceiver({ x: 6, z: 8 }))).toBe(true)
    expect(perceives(event, makePerceiver({ x: 9, z: 9 }))).toBe(false)
  })

  it('소음 반경은 3D 거리다: 바닥 거리가 같아도 높이 차가 반경을 넘기면 듣지 못한다', () => {
    const event = makeEvent({ kind: 'noise', intensity: 1 })
    expect(perceives(event, makePerceiver({ x: 2, z: 0 }))).toBe(true)
    expect(perceives(event, makePerceiver({ x: 2, y: 2.5, z: 0 }))).toBe(false)
  })

  it('웃음은 6m 이내에서 보이고, 어둠 속에서는 보이지 않는다', () => {
    const event = makeEvent({ kind: 'laughter' })
    expect(perceives(event, makePerceiver({ x: 6 }))).toBe(true)
    expect(perceives(event, makePerceiver({ x: 6.5 }))).toBe(false)
    expect(perceives(event, makePerceiver({ x: 1, inDarkness: true }))).toBe(false)
  })

  it('노출도 6m 이내이고 어둠 속이 아닐 때만 보인다', () => {
    const event = makeEvent({ kind: 'exposure' })
    expect(perceives(event, makePerceiver({ x: 5 }))).toBe(true)
    expect(perceives(event, makePerceiver({ x: 5, inDarkness: true }))).toBe(false)
    expect(perceives(event, makePerceiver({ x: 7 }))).toBe(false)
  })

  it('충격은 원천이나 대상 본인만 지각한다', () => {
    const event = makeEvent({ kind: 'impact', sourceId: 'a', targetId: 'b' })
    expect(perceives(event, makePerceiver({ id: 'a' }))).toBe(true)
    expect(perceives(event, makePerceiver({ id: 'b' }))).toBe(true)
    expect(perceives(event, makePerceiver({ id: 'c' }))).toBe(false)
  })

  it('분노는 대상에게만 향한다', () => {
    const event = makeEvent({ kind: 'anger', targetId: 'b' })
    expect(perceives(event, makePerceiver({ id: 'b', x: 100 }))).toBe(true)
    expect(perceives(event, makePerceiver({ id: 'c' }))).toBe(false)
  })

  it('대상이 없는 분노는 6m 이내 모두가 지각한다', () => {
    const event = makeEvent({ kind: 'anger', targetId: null })
    expect(perceives(event, makePerceiver({ x: 6 }))).toBe(true)
    expect(perceives(event, makePerceiver({ x: 7 }))).toBe(false)
  })

  it('어둠은 어둠 속에 있는 자만 지각한다', () => {
    const event = makeEvent({ kind: 'darkness' })
    expect(perceives(event, makePerceiver({ inDarkness: true, x: 50 }))).toBe(true)
    expect(perceives(event, makePerceiver({ inDarkness: false }))).toBe(false)
  })

  it('정적은 언제나 지각한다', () => {
    const event = makeEvent({ kind: 'silence' })
    expect(perceives(event, makePerceiver({ x: 99, inDarkness: true }))).toBe(true)
  })

  it('자기가 낸 이벤트는 충격을 빼고 지각하지 않는다', () => {
    const own = makePerceiver({ id: 'src' })
    expect(perceives(makeEvent({ kind: 'noise', intensity: 3 }), own)).toBe(false)
    expect(perceives(makeEvent({ kind: 'laughter' }), own)).toBe(false)
    expect(perceives(makeEvent({ kind: 'silence' }), own)).toBe(false)
    expect(perceives(makeEvent({ kind: 'anger', targetId: 'src' }), own)).toBe(false)
    expect(perceives(makeEvent({ kind: 'anger', targetId: null }), own)).toBe(false)
    expect(perceives(makeEvent({ kind: 'exposure' }), own)).toBe(false)
    expect(perceives(makeEvent({ kind: 'darkness' }), makePerceiver({ id: 'src', inDarkness: true }))).toBe(false)
    expect(perceives(makeEvent({ kind: 'impact' }), own)).toBe(true)
  })
})

describe('targetsSelf', () => {
  it('대상이 본인일 때만 true다', () => {
    const event = makeEvent({ targetId: 'b' })
    expect(targetsSelf(event, 'b')).toBe(true)
    expect(targetsSelf(event, 'c')).toBe(false)
    expect(targetsSelf(makeEvent({ targetId: null }), 'b')).toBe(false)
  })
})

describe('EventLog', () => {
  const base: Omit<PhenomenonEvent, 'id' | 'depth'> = {
    kind: 'noise',
    intensity: 1,
    sourceId: 's',
    targetId: null,
    x: 0,
    y: 0,
    z: 0,
    step: 0,
    causeId: null,
  }

  it('id를 1부터 늘리고 원인이 없으면 depth 1이다', () => {
    const log = new EventLog()
    const first = log.emit(base)
    const second = log.emit(base)
    expect([first.id, second.id]).toEqual([1, 2])
    expect(first.depth).toBe(1)
    expect(log.get(2)).toBe(second)
    expect(log.get(99)).toBeUndefined()
    expect(log.get(0)).toBeUndefined()
    expect(log.get(-1)).toBeUndefined()
    expect(log.get(1.5)).toBeUndefined()
  })

  it('원인이 있으면 depth가 원인보다 1 크다', () => {
    const log = new EventLog()
    const root = log.emit(base)
    const child = log.emit({ ...base, causeId: root.id })
    const grandchild = log.emit({ ...base, causeId: child.id })
    expect(child.depth).toBe(2)
    expect(grandchild.depth).toBe(3)
  })

  it('breakChains 뒤에는 원인이 있어도 depth 1부터 다시 세고 causeId는 남긴다', () => {
    const log = new EventLog()
    const root = log.emit(base)
    log.breakChains()
    const after = log.emit({ ...base, causeId: root.id })
    expect(after.depth).toBe(1)
    expect(after.causeId).toBe(root.id)
    expect(log.emit({ ...base, causeId: after.id }).depth).toBe(2)
  })

  it('since는 step 이상인 이벤트를 emit 순서대로 돌려준다', () => {
    const log = new EventLog()
    log.emit({ ...base, step: 1 })
    const b = log.emit({ ...base, step: 2 })
    const c = log.emit({ ...base, step: 3 })
    expect(log.since(2)).toEqual([b, c])
    expect(log.since(4)).toEqual([])
  })

  it('chain은 뿌리부터 자신까지 순서대로 돌려준다', () => {
    const log = new EventLog()
    const a = log.emit(base)
    const b = log.emit({ ...base, causeId: a.id })
    const c = log.emit({ ...base, causeId: b.id })
    expect(log.chain(c.id)).toEqual([a, b, c])
    expect(log.chain(a.id)).toEqual([a])
  })

  it('chain은 로그에 없는 원인에서 멈추고, 없는 id는 빈 배열이다', () => {
    const log = new EventLog()
    const orphan = log.emit({ ...base, causeId: 42 })
    expect(log.chain(orphan.id)).toEqual([orphan])
    expect(log.chain(99)).toEqual([])
  })
})

describe('기척(강도 0)', () => {
  it('isStir는 강도 0만 기척으로 본다', () => {
    expect(isStir(makeEvent({ intensity: 0 }))).toBe(true)
    expect(isStir(makeEvent({ intensity: 1 }))).toBe(false)
  })

  it('기척 소음은 2m 안에서만, 기척 웃음은 4m 안이고 어둡지 않을 때만 인지한다', () => {
    const noise = makeEvent({ kind: 'noise', intensity: 0 })
    expect(perceives(noise, makePerceiver({ x: 2 }))).toBe(true)
    expect(perceives(noise, makePerceiver({ x: 2.01 }))).toBe(false)

    const laughter = makeEvent({ kind: 'laughter', intensity: 0 })
    expect(perceives(laughter, makePerceiver({ x: 4 }))).toBe(true)
    expect(perceives(laughter, makePerceiver({ x: 4.01 }))).toBe(false)
    expect(perceives(laughter, makePerceiver({ x: 1, inDarkness: true }))).toBe(false)
  })

  it('대상이 있는 기척 분노는 대상만 인지한다', () => {
    const anger = makeEvent({ kind: 'anger', intensity: 0, targetId: 'me' })
    expect(perceives(anger, makePerceiver({ id: 'me', x: 3 }))).toBe(true)
    expect(perceives(anger, makePerceiver({ id: 'other', x: 0 }))).toBe(false)
    const open = makeEvent({ kind: 'anger', intensity: 0, targetId: null })
    expect(perceives(open, makePerceiver({ x: 4 }))).toBe(true)
    expect(perceives(open, makePerceiver({ x: 4.5 }))).toBe(false)
  })
})

describe('EventLog 깊이와 뿌리', () => {
  const strong: Omit<PhenomenonEvent, 'id' | 'depth'> = {
    kind: 'anger',
    intensity: 2,
    sourceId: 's',
    targetId: null,
    x: 0,
    y: 0,
    z: 0,
    step: 0,
    causeId: null,
  }
  const stir: Omit<PhenomenonEvent, 'id' | 'depth'> = { ...strong, kind: 'laughter', intensity: 0 }

  it('원인 없는 기척의 깊이는 0, 깊이 2 사건이 원인인 기척은 2, 기척이 원인인 강도 1은 1이다', () => {
    const log = new EventLog()
    expect(log.emit(stir).depth).toBe(0)

    const root = log.emit(strong)
    const second = log.emit({ ...strong, causeId: root.id })
    expect(second.depth).toBe(2)
    expect(log.emit({ ...stir, causeId: second.id }).depth).toBe(2)

    const lonelyStir = log.emit(stir)
    expect(log.emit({ ...strong, intensity: 1, causeId: lonelyStir.id }).depth).toBe(1)
  })

  it('광고 전 사건이 원인인 기척은 0, 강도 1은 1이다', () => {
    const log = new EventLog()
    const root = log.emit(strong)
    const second = log.emit({ ...strong, causeId: root.id })
    log.breakChains()
    expect(log.emit({ ...stir, causeId: second.id }).depth).toBe(0)
    expect(log.emit({ ...strong, intensity: 1, causeId: second.id }).depth).toBe(1)
  })

  it('linkedCauseDepth는 이어지는 원인의 깊이이고, 원인이 없거나 광고로 끊겼으면 0이다', () => {
    const log = new EventLog()
    const root = log.emit(strong)
    const second = log.emit({ ...strong, causeId: root.id })
    expect(log.linkedCauseDepth(second.id)).toBe(2)
    expect(log.linkedCauseDepth(null)).toBe(0)
    expect(log.linkedCauseDepth(99)).toBe(0)
    log.breakChains()
    expect(log.linkedCauseDepth(second.id)).toBe(0)
  })

  it('rootOf는 기척을 거쳐 원인 없는 사건까지 가고, 광고로 끊긴 연결은 넘지 않는다', () => {
    const log = new EventLog()
    const root = log.emit(strong)
    const middle = log.emit({ ...stir, causeId: root.id })
    const leaf = log.emit({ ...strong, causeId: middle.id })
    expect(log.rootOf(leaf.id)).toBe(root)
    expect(log.rootOf(root.id)).toBe(root)
    expect(log.rootOf(99)).toBeUndefined()

    log.breakChains()
    const after = log.emit({ ...strong, causeId: leaf.id })
    const afterLeaf = log.emit({ ...strong, causeId: after.id })
    expect(log.rootOf(afterLeaf.id)).toBe(after)
  })

  it('강도 0인 충격이나 어둠은 emit이 throw한다', () => {
    const log = new EventLog()
    expect(() => log.emit({ ...strong, kind: 'impact', intensity: 0 })).toThrow()
    expect(() => log.emit({ ...strong, kind: 'darkness', intensity: 0 })).toThrow()
    expect(() => log.emit({ ...strong, kind: 'silence', intensity: 0 })).toThrow()
  })
})
