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
  readonly enemies: readonly EnemySpec[]
  readonly initialSentence: readonly ClauseSpec[]
  readonly interventionLoop: readonly InterventionStep[]
}

export const ENCOUNTERS: Record<string, EncounterDef> = {
  spider: {
    id: 'spider',
    enemies: [{ defId: 'spider', name: '거미', hp: 30, row: 'front', portrait: '/assets/spider.jpg' }],
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
      { kind: 'revert', at: { clause: 0, role: 'subject' } },
      { kind: 'revert', at: { clause: 0, role: 'object' } },
      { kind: 'attach', at: { clause: 0, role: 'verb' }, word: 'fiercely' },
      { kind: 'pollute', word: 'web', count: 1 },
      { kind: 'enrage' },
    ],
  },
}

export const STARTER_DECK: readonly WordId[] = [
  'you', 'you', 'mark', 'scarecrow', 'bite', 'guard', 'mend', 'sleep', 'blind', 'fiercely',
]
