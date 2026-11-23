import type { WordKind } from '@/game/grammar/frames'

export type WordId = string
export type TokenId = 'scarecrow'
export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare'
export type VerbRange = 'melee' | 'ranged' | 'support'
export type ActionTarget = 'subject' | 'object'

export type VerbAction =
  | { readonly kind: 'damage'; readonly amount: number }
  | { readonly kind: 'block'; readonly amount: number; readonly to: ActionTarget }
  | { readonly kind: 'heal'; readonly amount: number; readonly to: ActionTarget }
  | { readonly kind: 'freeze'; readonly to: ActionTarget }

export type TargetRef =
  | { readonly kind: 'player' }
  | { readonly kind: 'chosenEnemy' }
  | { readonly kind: 'token'; readonly tokenId: TokenId }
  | { readonly kind: 'enemyDef'; readonly defId: string }

export type AdjectiveMod =
  | { readonly kind: 'outgoingDamageMul'; readonly value: number }
  | { readonly kind: 'onHitPoison'; readonly amount: number }

export type AdverbMod = { readonly kind: 'powerMul'; readonly value: number }

export type WordEffect =
  | { readonly type: 'target'; readonly ref: TargetRef }
  | { readonly type: 'verb'; readonly range: VerbRange; readonly actions: readonly VerbAction[] }
  | { readonly type: 'adjective'; readonly mods: readonly AdjectiveMod[] }
  | { readonly type: 'adverb'; readonly mods: readonly AdverbMod[] }
  | { readonly type: 'junk' }

export interface WordDef {
  readonly id: WordId
  readonly text: string
  readonly kind: WordKind
  /** null이면 사용할 수 없는 단어(오염). */
  readonly cost: number | null
  readonly ink: number
  readonly rarity: Rarity
  readonly effect: WordEffect
  readonly enemyOnly: boolean
}

type WordInput = Omit<WordDef, 'cost' | 'ink' | 'enemyOnly'> & Partial<Pick<WordDef, 'cost' | 'ink' | 'enemyOnly'>>

const DEFAULT_COST = 1
const DEFAULT_INK = 2

function defineWords(inputs: readonly WordInput[]): Record<WordId, WordDef> {
  const words: Record<WordId, WordDef> = {}
  for (const input of inputs) {
    words[input.id] = {
      cost: DEFAULT_COST,
      ink: DEFAULT_INK,
      enemyOnly: false,
      ...input,
    }
  }
  return words
}

export const WORDS: Record<WordId, WordDef> = defineWords([
  { id: 'you', text: '당신', kind: 'target', rarity: 'starter', effect: { type: 'target', ref: { kind: 'player' } } },
  { id: 'mark', text: '지목', kind: 'target', rarity: 'starter', effect: { type: 'target', ref: { kind: 'chosenEnemy' } } },
  {
    id: 'scarecrow', text: '허수아비', kind: 'target', rarity: 'starter',
    effect: { type: 'target', ref: { kind: 'token', tokenId: 'scarecrow' } },
  },
  {
    id: 'bite', text: '물어뜯는다', kind: 'verbTransitive', rarity: 'starter',
    effect: { type: 'verb', range: 'melee', actions: [{ kind: 'damage', amount: 6 }] },
  },
  {
    id: 'guard', text: '막는다', kind: 'verbTransitive', rarity: 'starter',
    effect: { type: 'verb', range: 'support', actions: [{ kind: 'block', amount: 6, to: 'subject' }] },
  },
  {
    id: 'mend', text: '치유한다', kind: 'verbTransitive', rarity: 'starter',
    effect: { type: 'verb', range: 'support', actions: [{ kind: 'heal', amount: 5, to: 'object' }] },
  },
  {
    id: 'sleep', text: '잠든다', kind: 'verbIntransitive', rarity: 'starter',
    effect: { type: 'verb', range: 'support', actions: [{ kind: 'freeze', to: 'subject' }] },
  },
  {
    id: 'blind', text: '눈먼', kind: 'adjective', rarity: 'starter',
    effect: { type: 'adjective', mods: [{ kind: 'outgoingDamageMul', value: 0.5 }] },
  },
  {
    id: 'venomous', text: '독을 뿜는', kind: 'adjective', rarity: 'common',
    effect: { type: 'adjective', mods: [{ kind: 'onHitPoison', amount: 2 }] },
  },
  {
    id: 'fiercely', text: '격렬하게', kind: 'adverb', rarity: 'starter',
    effect: { type: 'adverb', mods: [{ kind: 'powerMul', value: 1.5 }] },
  },
  {
    id: 'spider', text: '거미', kind: 'target', rarity: 'common', enemyOnly: true,
    effect: { type: 'target', ref: { kind: 'enemyDef', defId: 'spider' } },
  },
  { id: 'web', text: '거미줄', kind: 'junk', rarity: 'common', cost: null, effect: { type: 'junk' } },
])

export function getWord(id: WordId): WordDef {
  const word = WORDS[id]
  if (!word) throw new Error(`알 수 없는 단어 id: ${id}`)
  return word
}
