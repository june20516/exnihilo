import type { Row } from '@/kit/core/entity'
import type { FrameId, SlotRole } from '@/game/grammar/frames'
import type { WordId } from './words'

export interface SlotAddress {
  readonly clause: number
  readonly role: SlotRole
}

/** 문장 하나의 원문: 슬롯마다 head 단어와 수식어. */
export interface ClauseSpec {
  readonly frameId: FrameId
  readonly slots: readonly { readonly role: SlotRole; readonly head: WordId; readonly modifiers?: readonly WordId[] }[]
}

/** v2 기본 랠리의 적. 예고 문장 목록을 턴마다 순서대로 순환한다. */
export interface RallyEnemySpec {
  readonly defId: string
  readonly name: string
  readonly hp: number
  readonly row: Row
  readonly portrait: string
  readonly intents: readonly ClauseSpec[]
}

export interface RallyEncounterDef {
  readonly id: string
  readonly name: string
  readonly enemies: readonly RallyEnemySpec[]
}

function intent(subject: WordId, verb: WordId, subjectModifiers: readonly WordId[] = []): ClauseSpec {
  return {
    frameId: 'transitive',
    slots: [
      { role: 'subject', head: subject, modifiers: subjectModifiers },
      { role: 'object', head: 'you' },
      { role: 'verb', head: verb },
    ],
  }
}

/** spec §3. 수치는 기본 규칙 게이트(§7)로 튜닝한다. */
export const RALLY_ENCOUNTERS: Record<string, RallyEncounterDef> = {
  spider: {
    id: 'spider',
    name: '거미',
    enemies: [
      {
        defId: 'spider', name: '거미', hp: 45, row: 'front', portrait: '/assets/spider.jpg',
        intents: [intent('spider', 'spiderBite'), intent('spider', 'spiderNip', ['venomous']), intent('spider', 'curl')],
      },
    ],
  },
  swarm: {
    id: 'swarm',
    name: '새끼 거미 떼',
    enemies: [1, 2, 3].map((n) => ({
      defId: 'spiderling', name: `새끼 거미 ${n}`, hp: 10, row: 'front' as const, portrait: '/assets/spider.jpg',
      intents: [intent('spiderling', 'nibble')],
    })),
  },
  slime: {
    id: 'slime',
    name: '슬라임',
    enemies: [
      {
        defId: 'slime', name: '슬라임', hp: 34, row: 'front', portrait: '/assets/spider.jpg',
        intents: [intent('slime', 'swell'), intent('slime', 'crush')],
      },
    ],
  },
}

/** spec §4 시작 덱(15장): 동사 10, 수식어 5. */
export const RALLY_STARTER_DECK: readonly WordId[] = [
  'bite', 'bite', 'bite', 'slash', 'guard', 'guard', 'hide', 'rage', 'scare', 'mend', 'fiercely', 'fiercely', 'hungry', 'cracked', 'venomous',
]
