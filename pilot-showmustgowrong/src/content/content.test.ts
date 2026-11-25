import { afterEach, describe, expect, it } from 'vitest'
import { STEP_SECONDS, STUDIO_DEPTH, STUDIO_HEIGHT, STUDIO_WIDTH } from './balance'
import { inFrame } from '@/sim/broadcast'
import { STANDING_Y } from '@/sim/cast'
import { Broadcast } from '@/sim/engine'
import { initPhysics, PhysicsWorld } from '@/sim/physics'
import { type FloorPoint, floorDistance } from '@/sim/vec'
import { LINEUP } from './lineup'
import { TALK_SHOW } from './talkShow'
import type { ActionDef, PerformerDef, PhenomenonKind, Trigger } from './types'
import { validateShow } from './validate'

const BASIC_PHENOMENA: readonly PhenomenonKind[] = [
  'gaze',
  'noise',
  'impact',
  'laughter',
  'anger',
  'darkness',
  'exposure',
  'silence',
]

const allPerformers = [...LINEUP.performers, ...LINEUP.bench]

/** 반응·지시·장비 파손에 쓰인 현상 종류 전부 */
function usedPhenomena(): string[] {
  const kinds: string[] = []
  const fromAction = (action: ActionDef) => {
    for (const emit of action.emits) kinds.push(emit.kind)
  }
  const fromTrigger = (trigger: Trigger) => {
    if (trigger.kind !== 'corner') kinds.push(trigger.kind)
  }
  for (const performer of allPerformers) {
    for (const reaction of performer.reactions) {
      fromTrigger(reaction.trigger)
      fromAction(reaction.action)
    }
    for (const directive of performer.directives) fromAction(directive.action)
  }
  for (const member of LINEUP.staff) {
    for (const reaction of member.reactions) {
      fromTrigger(reaction.trigger)
      fromAction(reaction.action)
    }
  }
  for (const piece of LINEUP.equipment) {
    for (const emit of piece.onBreak) kinds.push(emit.kind)
  }
  return kinds
}

describe('토크쇼 콘텐츠', () => {
  it('validateShow를 통과한다', () => {
    expect(validateShow(TALK_SHOW, allPerformers, LINEUP.staff, LINEUP.equipment)).toEqual([])
  })

  it('모든 출연자와 스태프가 지시를 2개 이상 가진다', () => {
    for (const performer of allPerformers) {
      expect(performer.directives.length, performer.id).toBeGreaterThanOrEqual(2)
    }
    for (const member of LINEUP.staff) {
      expect(member.directives.length, member.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('모든 반응과 행동은 spec의 기본 현상 8개만 쓴다', () => {
    const used = usedPhenomena()
    expect(used.length).toBeGreaterThan(0)
    for (const kind of used) expect(BASIC_PHENOMENA).toContain(kind)
  })

  it('무대 출연자는 home spot 수와 같고, 코너 시작 태그마다 그 태그의 무대 출연자가 있다', () => {
    expect(LINEUP.performers).toHaveLength(TALK_SHOW.homeSpots.length)
    const stageTags = new Set(LINEUP.performers.flatMap((performer) => performer.tags))
    for (const corner of TALK_SHOW.corners) expect(stageTags).toContain(corner.startTag)
  })

  it('출연자 이름은 한글 전체 표기와 짧은 이름을 가진다', () => {
    const hangul = /[가-힣]/
    for (const performer of allPerformers) {
      expect(performer.name).toMatch(hangul)
      expect(performer.shortName).toMatch(hangul)
      expect(performer.name.length).toBeGreaterThan(performer.shortName.length)
    }
  })

  describe('카메라 배치(Ruling 15)', () => {
    const camera = (id: string) => {
      const found = TALK_SHOW.cameras.find((candidate) => candidate.id === id)
      if (found === undefined) throw new Error(`카메라가 없습니다: ${id}`)
      return found
    }
    const standing = (spot: FloorPoint) => ({ x: spot.x, y: STANDING_Y, z: spot.z })
    const frames = (id: string, spot: FloorPoint) =>
      inFrame(camera(id), camera(id).defaultAngle, standing(spot))
    const zone = TALK_SHOW.audienceZone
    const audienceCenter: FloorPoint = {
      x: (zone.minX + zone.maxX) / 2,
      z: (zone.minZ + zone.maxZ) / 2,
    }
    const homeSpots = TALK_SHOW.homeSpots

    it('카메라는 스튜디오(16×9×10) 안에 있다', () => {
      for (const { position } of TALK_SHOW.cameras) {
        expect(position.x).toBeGreaterThanOrEqual(0)
        expect(position.x).toBeLessThanOrEqual(STUDIO_WIDTH)
        expect(position.y).toBeGreaterThanOrEqual(0)
        expect(position.y).toBeLessThanOrEqual(STUDIO_HEIGHT)
        expect(position.z).toBeGreaterThanOrEqual(0)
        expect(position.z).toBeLessThanOrEqual(STUDIO_DEPTH)
      }
    })

    it('카메라는 모두 스튜디오 앞쪽(z ≥ 8)이나 옆에 있어 쿼터뷰에서 무대를 가리지 않는다', () => {
      // 옆: 옆벽에서 1m 안. home spot(x 4.5~12.5)에서 3.5m 넘게 떨어져 쿼터뷰 화면 좌우 끝에
      // 그려지므로 무대 위에 겹치지 않는다(앞쪽 기준 z ≥ 8도 무대 줄 z 4에서 4m 앞이다).
      const SIDE_MARGIN = 1
      for (const { id, position } of TALK_SHOW.cameras) {
        const front = position.z >= 8
        const side = position.x <= SIDE_MARGIN || position.x >= STUDIO_WIDTH - SIDE_MARGIN
        expect(front || side, id).toBe(true)
      }
    })

    it('와이드는 home spot 전부를 잡고 관객석 중앙은 잡지 않는다', () => {
      for (const spot of homeSpots) expect(frames('wide', spot), `x ${spot.x}`).toBe(true)
      expect(frames('wide', audienceCenter)).toBe(false)
    })

    it('클로즈업은 추적 카메라이고 화각 24°, 기본 방향으로 첫 home spot을 잡는다', () => {
      expect(camera('close')).toMatchObject({ tracking: true, fovDegrees: 24, shotIntensity: 2 })
      expect(frames('close', homeSpots[0])).toBe(true)
    })

    it('관객석 카메라는 관객석 중앙을 잡고 home spot은 하나도 잡지 않는다', () => {
      expect(frames('audienceCam', audienceCenter)).toBe(true)
      for (const spot of homeSpots) expect(frames('audienceCam', spot), `x ${spot.x}`).toBe(false)
    })

    it('세트 벽과 조명은 와이드와 home spot 사이를 가리지 않는다', async () => {
      await initPhysics()
      const world = new PhysicsWorld()
      try {
        for (const piece of LINEUP.equipment) world.addEquipment(piece)
        world.step()
        for (const spot of homeSpots) {
          expect(world.lineOfSight(camera('wide').position, standing(spot)), `x ${spot.x}`).toBe(
            true,
          )
        }
      } finally {
        world.dispose()
      }
    })

    it('조명의 어둠 원은 home spot 2곳 이상을 덮는다', () => {
      const light = LINEUP.equipment.find((piece) => piece.kind === 'hangingLight')
      const darkness = light?.darknessZone
      if (darkness === undefined) throw new Error('어둠 구역이 있는 조명이 없습니다.')
      const covered = homeSpots.filter((spot) => floorDistance(spot, darkness) <= darkness.radius)
      expect(covered.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('토크쇼 장비(Ruling 28)', () => {
  const opened: Broadcast[] = []
  afterEach(() => {
    for (const broadcast of opened.splice(0)) broadcast.dispose()
  })

  const performerById = (id: string): PerformerDef => {
    const found = allPerformers.find((performer) => performer.id === id)
    if (found === undefined) throw new Error(`출연자가 없습니다: ${id}`)
    return found
  }

  // 모를 도발해 바디슬램(leap toward cause)을 끌어내는 시험용 출연자
  const HECKLER: PerformerDef = {
    ...performerById('okafor'),
    id: 'heckler',
    shortName: '야유꾼',
    // 모의 지시가 host 태그를 가리키므로 검증을 통과하게 host를 단다
    tags: ['host'],
    reactions: [],
    directives: [
      {
        id: 'taunt',
        label: '도발',
        action: {
          pose: 'angry',
          emits: [{ kind: 'anger', intensity: 2, target: { tag: 'athlete' } }],
        },
      },
      { id: 'calm', label: '진정', action: { pose: 'idle', emits: [] } },
    ],
  }

  it('라인업의 모가 조명 쪽으로 바디슬램하면 조명이 깨지고 어둠이 생긴다', async () => {
    // 조명을 사이에 두고 야유꾼과 모를 조명 양옆 home spot(2번째, 3번째)에 세운다
    const broadcast = await Broadcast.create({
      show: { ...TALK_SHOW, homeSpots: [TALK_SHOW.homeSpots[1], TALK_SHOW.homeSpots[2]] },
      performers: [HECKLER, performerById('mo')],
      bench: [],
      staff: [],
      equipment: LINEUP.equipment,
      seed: 1,
    })
    opened.push(broadcast)
    broadcast.step([{ type: 'direct', actorId: 'heckler', directiveId: 'taunt' }])
    for (let i = 0; i < Math.round(1 / STEP_SECONDS); i++) broadcast.step([])

    const events = broadcast.events()
    const breakImpact = events.find(
      (event) => event.kind === 'impact' && event.targetId === 'overheatedLight',
    )
    expect(breakImpact).toMatchObject({ sourceId: 'mo' })
    expect(breakImpact?.intensity).toBeGreaterThanOrEqual(2)
    const light = broadcast.view().equipment.find((piece) => piece.id === 'overheatedLight')
    expect(light?.released).toBe(true)
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'darkness',
        sourceId: 'overheatedLight',
        causeId: breakImpact?.id,
      }),
    )
  })
})
