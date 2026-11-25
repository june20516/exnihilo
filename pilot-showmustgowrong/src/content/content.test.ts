import { describe, expect, it } from 'vitest'
import { inFrame } from '@/sim/broadcast'
import { STANDING_Y } from '@/sim/cast'
import { LINEUP } from './lineup'
import { TALK_SHOW } from './talkShow'
import type { ActionDef, PhenomenonKind, Trigger } from './types'
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
    const frames = (id: string, x: number) =>
      inFrame(camera(id), camera(id).defaultAngle, x, STANDING_Y)
    const audienceCenter = (TALK_SHOW.audienceZone.minX + TALK_SHOW.audienceZone.maxX) / 2
    const homeXs = TALK_SHOW.homeSpots.map((spot) => spot.x)

    it('카메라는 스튜디오(16×9) 안에 있다', () => {
      for (const { position } of TALK_SHOW.cameras) {
        expect(position.x).toBeGreaterThanOrEqual(0)
        expect(position.x).toBeLessThanOrEqual(16)
        expect(position.y).toBeGreaterThanOrEqual(0)
        expect(position.y).toBeLessThanOrEqual(9)
      }
    })

    it('와이드는 home spot 전부를 잡고 관객석은 잡지 않는다', () => {
      for (const x of homeXs) expect(frames('wide', x), `x ${x}`).toBe(true)
      expect(frames('wide', audienceCenter)).toBe(false)
    })

    it('클로즈업은 무대 쪽 일부만 잡는다', () => {
      expect(homeXs.filter((x) => frames('close', x)).length).toBeGreaterThan(0)
      expect(homeXs.filter((x) => frames('close', x)).length).toBeLessThan(homeXs.length)
      expect(frames('close', audienceCenter)).toBe(false)
      expect(camera('close').shotIntensity).toBe(2)
    })

    it('관객석 카메라는 관객 구역만 잡는다', () => {
      expect(frames('audienceCam', audienceCenter)).toBe(true)
      for (const x of homeXs) expect(frames('audienceCam', x), `x ${x}`).toBe(false)
    })
  })
})
