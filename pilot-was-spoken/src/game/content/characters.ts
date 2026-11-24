import type { SlotRole } from '@/game/grammar/frames'
import type { WordId } from './words'

/** 플레이어 개체의 defId. 캐릭터가 여럿이어도 전투 안의 플레이어 개체는 이 값으로 찾는다. */
export const PLAYER_DEF_ID = 'player'

/** 전투 안 플레이어 개체의 id. */
export const PLAYER_ID = 'p'

export type CharacterId = 'explorer'

/**
 * 플레이어블 캐릭터(콘텐츠 표). 캐릭터마다 달라질 값은 모두 여기에 둔다.
 * 새 캐릭터는 이 표에 정의를 더하면 된다(백로그 C3: 추가 버리기, 다른 기본 동사 등).
 */
export interface CharacterDef {
  readonly id: CharacterId
  readonly name: string
  readonly maxHp: number
  readonly handMax: number
  readonly discardsPerTurn: number
  /** 슬롯별 수식어 칸 수. */
  readonly slots: Readonly<Record<SlotRole, number>>
  /** 손패 밖의 고정 타일로 늘 쓸 수 있는 동사(v3 규칙 spec §3.1). */
  readonly basicVerb: WordId
  readonly starterDeck: readonly WordId[]
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = {
  explorer: {
    id: 'explorer',
    name: '탐험가',
    maxHp: 60,
    handMax: 6,
    discardsPerTurn: 1,
    slots: { subject: 2, object: 2, verb: 2 },
    basicVerb: 'strike',
    starterDeck: [
      'bite', 'bite', 'counter', 'slash', 'guard', 'guard', 'hide', 'rage', 'scare', 'mend', 'fiercely', 'fiercely', 'hungry', 'cracked', 'venomous',
    ],
  },
}

export const DEFAULT_CHARACTER: CharacterId = 'explorer'
