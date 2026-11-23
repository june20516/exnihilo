import type { Row } from '@/kit/core/entity'
import type { FrameId, SlotRole } from '@/game/grammar/frames'
import type { WordId } from './words'

export interface SlotAddress {
  readonly clause: number
  readonly role: SlotRole
}

export type InterventionStep =
  | { readonly kind: 'revert'; readonly at: SlotAddress }
  | { readonly kind: 'attach'; readonly at: SlotAddress; readonly word: WordId }
  | { readonly kind: 'replace'; readonly at: SlotAddress; readonly word: WordId }
  | { readonly kind: 'seal'; readonly at: SlotAddress }
  | { readonly kind: 'pollute'; readonly word: WordId; readonly count: number }
  | { readonly kind: 'enrage' }

export interface ClauseSpec {
  readonly frameId: FrameId
  readonly slots: readonly { readonly role: SlotRole; readonly head: WordId; readonly modifiers?: readonly WordId[] }[]
}

export interface EnemySpec {
  readonly defId: string
  readonly name: string
  readonly hp: number
  readonly row: Row
  readonly portrait: string
}

export interface EncounterDef {
  readonly id: string
  readonly name: string
  readonly enemies: readonly EnemySpec[]
  readonly initialSentence: readonly ClauseSpec[]
  readonly interventionLoop: readonly InterventionStep[]
  /** 낭독 모드(execution: cast)에서 적이 문장을 낭독하는 주기(턴). */
  readonly castEvery: number
}

const at = (role: SlotRole): SlotAddress => ({ clause: 0, role })

export const ENCOUNTERS: Record<string, EncounterDef> = {
  spider: {
    id: 'spider',
    name: '거미',
    enemies: [{ defId: 'spider', name: '거미', hp: 42, row: 'front', portrait: '/assets/spider.jpg' }],
    initialSentence: [
      {
        frameId: 'transitive',
        slots: [
          { role: 'subject', head: 'spider', modifiers: ['venomous'] },
          { role: 'object', head: 'you' },
          { role: 'verb', head: 'bite' },
        ],
      },
    ],
    interventionLoop: [
      { kind: 'enrage' },
      { kind: 'revert', at: at('object') },
      { kind: 'revert', at: at('verb') },
      { kind: 'revert', at: at('object') },
      { kind: 'attach', at: at('verb'), word: 'fiercely' },
    ],
    castEvery: 2,
  },
  swarm: {
    id: 'swarm',
    name: '거미 떼',
    enemies: [1, 2, 3].map((n) => ({ defId: 'spiderling', name: `새끼 거미 ${n}`, hp: 9, row: 'front' as const, portrait: '/assets/spider.jpg' })),
    initialSentence: [
      {
        frameId: 'transitive',
        slots: [
          { role: 'subject', head: 'spiderling' },
          { role: 'object', head: 'you' },
          { role: 'verb', head: 'nibble' },
        ],
      },
    ],
    interventionLoop: [
      { kind: 'enrage' },
      { kind: 'revert', at: at('object') },
      { kind: 'revert', at: at('verb') },
      { kind: 'revert', at: at('subject') },
    ],
    castEvery: 2,
  },
  slime: {
    id: 'slime',
    name: '슬라임',
    enemies: [{ defId: 'slime', name: '슬라임', hp: 30, row: 'front', portrait: '/assets/spider.jpg' }],
    initialSentence: [
      {
        frameId: 'transitive',
        slots: [
          { role: 'subject', head: 'slime' },
          { role: 'object', head: 'you' },
          { role: 'verb', head: 'swell' },
        ],
      },
    ],
    interventionLoop: [
      { kind: 'replace', at: at('verb'), word: 'crush' },
      { kind: 'revert', at: at('subject') },
      { kind: 'revert', at: at('verb') },
      { kind: 'enrage' },
      { kind: 'revert', at: at('object') },
    ],
    castEvery: 2,
  },
}

/** spec 10.5 시작 덱(15장). */
export const STARTER_DECK: readonly WordId[] = [
  'you', 'you', 'mark', 'mark', 'scarecrow', 'bite', 'bite', 'guard', 'mend', 'scare', 'rage', 'hide', 'blind', 'venomous',
  'fiercely',
]
