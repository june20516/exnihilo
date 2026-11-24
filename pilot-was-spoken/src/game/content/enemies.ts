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
  readonly intents: readonly RallyIntent[]
}

/** 적의 예고: 문장을 실행하거나, 내 문장의 슬롯 하나를 봉인한다(보스 규칙, 압박 레이어). */
export type RallyIntent = { readonly kind: 'clause'; readonly clause: ClauseSpec } | { readonly kind: 'seal' }

export type EncounterTier = 'normal' | 'elite' | 'boss'

export interface RallyEncounterDef {
  readonly id: string
  readonly name: string
  readonly tier: EncounterTier
  readonly enemies: readonly RallyEnemySpec[]
}

function intent(subject: WordId, verb: WordId, subjectModifiers: readonly WordId[] = []): RallyIntent {
  return {
    kind: 'clause',
    clause: {
      frameId: 'transitive',
      slots: [
        { role: 'subject', head: subject, modifiers: subjectModifiers },
        { role: 'object', head: 'you' },
        { role: 'verb', head: verb },
      ],
    },
  }
}

const SEAL: RallyIntent = { kind: 'seal' }

/** spec §3. 수치는 기본 규칙 게이트(§7)로 튜닝한다. */
export const RALLY_ENCOUNTERS: Record<string, RallyEncounterDef> = {
  spider: {
    id: 'spider',
    name: '거미',
    tier: 'normal',
    enemies: [
      {
        defId: 'spider', name: '거미', hp: 34, row: 'front', portrait: '/assets/spider.jpg',
        intents: [intent('spider', 'spiderBite'), intent('spider', 'spiderNip', ['venomous']), intent('spider', 'curl')],
      },
    ],
  },
  swarm: {
    id: 'swarm',
    name: '새끼 거미 떼',
    tier: 'normal',
    enemies: [1, 2, 3].map((n) => ({
      defId: 'spiderling', name: `새끼 거미 ${n}`, hp: 8, row: 'front' as const, portrait: '/assets/spider.jpg',
      intents: [intent('spiderling', 'nibble')],
    })),
  },
  slime: {
    id: 'slime',
    name: '슬라임',
    tier: 'normal',
    enemies: [
      {
        defId: 'slime', name: '슬라임', hp: 20, row: 'front', portrait: '/assets/spider.jpg',
        intents: [intent('slime', 'swell'), intent('slime', 'crush')],
      },
    ],
  },
  // 정예·보스 (런 spec §5). 수치는 런 게이트로 튜닝한다.
  queen: {
    id: 'queen',
    name: '거미 여왕',
    tier: 'elite',
    enemies: [
      {
        defId: 'spider', name: '거미 여왕', hp: 31, row: 'front', portrait: '/assets/spider.jpg',
        intents: [intent('spider', 'queenBite'), intent('spider', 'queenNip', ['venomous']), intent('spider', 'queenCurl')],
      },
    ],
  },
  gatekeeper: {
    id: 'gatekeeper',
    name: '문지기',
    tier: 'elite',
    enemies: [
      {
        defId: 'slime', name: '문지기', hp: 45, row: 'front', portrait: '/assets/spider.jpg',
        intents: [intent('slime', 'gateCurl'), intent('slime', 'gateCrush'), intent('slime', 'gateCrush')],
      },
    ],
  },
  scribe: {
    id: 'scribe',
    name: '필경사',
    tier: 'boss',
    enemies: [
      {
        defId: 'spider', name: '필경사', hp: 68, row: 'front', portrait: '/assets/spider.jpg',
        intents: [intent('spider', 'scribeSlash'), SEAL, intent('spider', 'scribeScold')],
      },
    ],
  },
}
