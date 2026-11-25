import { describe, expect, it } from 'vitest'
import type { ActionDef, Intensity, PhenomenonKind, ReactionDef } from '@/content/types'
import { createRng } from '@/kit/rng'
import type { PhenomenonEvent } from './phenomena'
import { CooldownTable, resolveReactions, type ReactorView } from './reactions'

const action = (pose: ActionDef['pose']): ActionDef => ({ pose, emits: [] })

function reaction(
  kind: Exclude<PhenomenonKind, 'gaze'>,
  min: Intensity,
  scope: 'perceived' | 'targetsSelf',
  pose: ActionDef['pose'],
  chance?: number,
): ReactionDef {
  return { trigger: { kind, min, scope }, action: action(pose), ...(chance === undefined ? {} : { chance }) }
}

function reactor(id: string, reactions: ReactionDef[], overrides: Partial<ReactorView> = {}): ReactorView {
  return { id, x: 0, y: 0, inDarkness: false, reactions, walkedOut: false, ...overrides }
}

function event(overrides: Partial<PhenomenonEvent> & Pick<PhenomenonEvent, 'id'>): PhenomenonEvent {
  return {
    kind: 'laughter',
    intensity: 2,
    sourceId: 'B',
    targetId: 'A',
    x: 1,
    y: 0,
    step: 0,
    causeId: null,
    depth: 1,
    ...overrides,
  }
}

const describeEvent = (e: PhenomenonEvent): string => `이벤트${e.id}`

describe('resolveReactions', () => {
  it('B의 웃음 2(대상 A)를 A가 지각하면 targetsSelf 반응이 계획된다', () => {
    const a = reactor('A', [reaction('laughter', 2, 'targetsSelf', 'angry')])
    const [planned] = resolveReactions([event({ id: 1 })], [a], new CooldownTable(), 0, createRng(1), describeEvent)
    expect(planned).toHaveLength(1)
    expect(planned[0]).toMatchObject({ actorId: 'A', reason: '이벤트1' })
    expect(planned[0].action.pose).toBe('angry')
    expect(planned[0].cause?.id).toBe(1)
  })

  it('최소 강도 미달이거나 scope가 맞지 않으면 계획하지 않는다', () => {
    const a = reactor('A', [reaction('laughter', 3, 'perceived', 'angry'), reaction('noise', 1, 'perceived', 'panic')])
    const b = reactor('C', [reaction('laughter', 1, 'targetsSelf', 'angry')])
    const [planned] = resolveReactions([event({ id: 1 })], [a, b], new CooldownTable(), 0, createRng(1), describeEvent)
    expect(planned).toHaveLength(0)
  })

  it('gaze와 corner 트리거는 무시한다', () => {
    const a = reactor('A', [
      { trigger: { kind: 'gaze', when: 'enter' }, action: action('panic') },
      { trigger: { kind: 'corner', tag: 'x' }, action: action('panic') },
    ])
    const [planned] = resolveReactions([event({ id: 1 })], [a], new CooldownTable(), 0, createRng(1), describeEvent)
    expect(planned).toHaveLength(0)
  })

  it('같은 반응은 60 스텝 안에는 계획되지 않고 60 스텝 뒤에는 계획된다', () => {
    const a = reactor('A', [reaction('laughter', 2, 'targetsSelf', 'angry')])
    const cooldowns = new CooldownTable()
    const rng = createRng(1)
    expect(resolveReactions([event({ id: 1 })], [a], cooldowns, 0, rng, describeEvent)[0]).toHaveLength(1)
    expect(resolveReactions([event({ id: 2 })], [a], cooldowns, 59, rng, describeEvent)[0]).toHaveLength(0)
    expect(resolveReactions([event({ id: 3 })], [a], cooldowns, 60, rng, describeEvent)[0]).toHaveLength(1)
  })

  it('A→B, B→A 순환을 120 스텝 흉내 내면 반응 횟수가 스텝 수를 넘지 않는다', () => {
    const a = reactor('A', [reaction('laughter', 1, 'targetsSelf', 'laugh')], { x: 0 })
    const b = reactor('B', [reaction('laughter', 1, 'targetsSelf', 'laugh')], { x: 1 })
    const cooldowns = new CooldownTable()
    let rng = createRng(1)
    let pending: PhenomenonEvent[] = [event({ id: 1, sourceId: 'B', targetId: 'A' })]
    let id = 2
    let count = 0
    for (let step = 0; step < 120; step++) {
      const [planned, next] = resolveReactions(pending, [a, b], cooldowns, step, rng, describeEvent)
      rng = next
      count += planned.length
      expect(planned.length).toBeLessThanOrEqual(2)
      pending = planned.map((p) =>
        event({ id: id++, sourceId: p.actorId, targetId: p.actorId === 'A' ? 'B' : 'A', step: step + 1 }),
      )
    }
    expect(count).toBeLessThanOrEqual(120)
    expect(count).toBeGreaterThan(0)
  })

  it('chance 0.5 반응은 같은 시드에서 항상 같은 결과이고 rng 상태를 이어 쓴다', () => {
    const a = reactor('A', [reaction('laughter', 2, 'perceived', 'angry', 0.5)])
    const run = (seed: number) => {
      const results: boolean[] = []
      let rng = createRng(seed)
      for (let step = 0; step < 20; step++) {
        const [planned, next] = resolveReactions([event({ id: step + 1 })], [a], new CooldownTable(), step, rng, describeEvent)
        rng = next
        results.push(planned.length === 1)
      }
      return { results, cursor: rng.cursor }
    }
    expect(run(7)).toEqual(run(7))
    expect(run(7).results).toContain(true)
    expect(run(7).results).toContain(false)
    expect(run(7).cursor).toBe(20)
  })

  it('chance가 없으면 rng를 소비하지 않는다', () => {
    const a = reactor('A', [reaction('laughter', 2, 'perceived', 'angry')])
    const rng = createRng(3)
    const [, next] = resolveReactions([event({ id: 1 })], [a], new CooldownTable(), 0, rng, describeEvent)
    expect(next).toEqual(rng)
  })

  it('walkedOut이면 아무것도 계획하지 않는다', () => {
    const a = reactor('A', [reaction('laughter', 2, 'targetsSelf', 'angry')], { walkedOut: true })
    const [planned] = resolveReactions([event({ id: 1 })], [a], new CooldownTable(), 0, createRng(1), describeEvent)
    expect(planned).toHaveLength(0)
  })

  it('한 actor는 한 스텝에 강도가 가장 큰 이벤트의 반응 하나만 한다', () => {
    const a = reactor('A', [reaction('laughter', 1, 'perceived', 'angry'), reaction('noise', 1, 'perceived', 'panic')])
    const events = [
      event({ id: 1, kind: 'laughter', intensity: 1 }),
      event({ id: 2, kind: 'noise', intensity: 3, sourceId: 'X', targetId: null }),
    ]
    const [planned] = resolveReactions(events, [a], new CooldownTable(), 0, createRng(1), describeEvent)
    expect(planned).toHaveLength(1)
    expect(planned[0].action.pose).toBe('panic')
    expect(planned[0].cause?.id).toBe(2)
  })

  it('강도가 같으면 먼저 정의된 반응이 이긴다', () => {
    const a = reactor('A', [reaction('noise', 1, 'perceived', 'panic'), reaction('laughter', 1, 'perceived', 'angry')])
    const events = [
      event({ id: 1, kind: 'laughter', intensity: 2 }),
      event({ id: 2, kind: 'noise', intensity: 2, sourceId: 'X', targetId: null }),
    ]
    const [planned] = resolveReactions(events, [a], new CooldownTable(), 0, createRng(1), describeEvent)
    expect(planned[0].action.pose).toBe('panic')
  })

  it('쿨다운 중인 반응은 후보에서 빠져 다음 후보가 선택된다', () => {
    const a = reactor('A', [reaction('noise', 1, 'perceived', 'panic'), reaction('laughter', 1, 'perceived', 'angry')])
    const cooldowns = new CooldownTable()
    cooldowns.mark('A', 'noise:perceived', 0)
    const events = [
      event({ id: 1, kind: 'noise', intensity: 3, sourceId: 'X', targetId: null }),
      event({ id: 2, kind: 'laughter', intensity: 1 }),
    ]
    const [planned] = resolveReactions(events, [a], cooldowns, 10, createRng(1), describeEvent)
    expect(planned[0].action.pose).toBe('angry')
  })

  it('chance가 실패하면 다음 후보로 넘어가지 않고 mark하지 않으며 rng는 한 번만 쓴다', () => {
    const a = reactor('A', [
      reaction('noise', 1, 'perceived', 'panic', 0.0001),
      reaction('laughter', 1, 'perceived', 'angry'),
    ])
    const events = [
      event({ id: 1, kind: 'noise', intensity: 3, sourceId: 'X', targetId: null }),
      event({ id: 2, kind: 'laughter', intensity: 1 }),
    ]
    const cooldowns = new CooldownTable()
    const [planned, next] = resolveReactions(events, [a], cooldowns, 0, createRng(1), describeEvent)
    expect(planned).toHaveLength(0)
    expect(next.cursor).toBe(1)
    expect(cooldowns.ready('A', 'noise:perceived', 0)).toBe(true)
  })

  it('결과는 reactors 순서를 따른다', () => {
    const r = (id: string) => reactor(id, [reaction('laughter', 1, 'perceived', 'angry')])
    const [planned] = resolveReactions([event({ id: 1, sourceId: 'X' })], [r('C'), r('A'), r('B')], new CooldownTable(), 0, createRng(1), describeEvent)
    expect(planned.map((p) => p.actorId)).toEqual(['C', 'A', 'B'])
  })
})

describe('CooldownTable', () => {
  it('clear하면 모두 준비 상태가 된다', () => {
    const table = new CooldownTable()
    table.mark('A', 'k', 5)
    expect(table.ready('A', 'k', 6)).toBe(false)
    table.clear()
    expect(table.ready('A', 'k', 6)).toBe(true)
  })
})
