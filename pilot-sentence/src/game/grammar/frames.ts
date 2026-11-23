import type { ParticleKind } from './josa'

/** 단어의 품사. 문법 슬롯의 허용 여부를 결정한다. (Plan 2에서 확장) */
export type WordKind = 'target' | 'verbTransitive' | 'verbIntransitive' | 'adjective' | 'adverb' | 'junk'

export type SlotRole = 'subject' | 'object' | 'verb'
export type FrameId = 'transitive'

export interface SlotDef {
  readonly role: SlotRole
  readonly accepts: readonly WordKind[]
  readonly particle: ParticleKind | null
}

export interface Frame {
  readonly id: FrameId
  readonly slots: readonly SlotDef[]
}

export const FRAMES: Record<FrameId, Frame> = {
  transitive: {
    id: 'transitive',
    slots: [
      { role: 'subject', accepts: ['target'], particle: 'subject' },
      { role: 'object', accepts: ['target'], particle: 'object' },
      { role: 'verb', accepts: ['verbTransitive', 'verbIntransitive'], particle: null },
    ],
  },
}

/** 수식어 품사가 붙을 수 있는 슬롯 역할. */
export const MODIFIER_TARGET_ROLES: Record<'adjective' | 'adverb', readonly SlotRole[]> = {
  adjective: ['subject', 'object'],
  adverb: ['verb'],
}
