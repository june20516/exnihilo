import type { StatusKind } from '@/kit/core/entity'
import type { WordKind } from '@/game/grammar/frames'

export type WordId = string
export type TokenId = 'scarecrow' | 'golem'
export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare'
export type VerbRange = 'melee' | 'ranged' | 'support'
export type ActionTarget = 'subject' | 'object'
/** 단어로 거는 상태(보호·빙결은 전용 동작이 있다). */
export type AppliedStatus = Extract<StatusKind, 'poison' | 'weak' | 'vulnerable' | 'strength'>

export type VerbAction =
  | { readonly kind: 'damage'; readonly amount: number; readonly lifesteal?: boolean }
  | { readonly kind: 'mutualDamage'; readonly amount: number }
  | { readonly kind: 'loseHp'; readonly amount: number; readonly to: ActionTarget }
  | { readonly kind: 'block'; readonly amount: number; readonly to: ActionTarget }
  | { readonly kind: 'heal'; readonly amount: number; readonly to: ActionTarget }
  | { readonly kind: 'freeze'; readonly to: ActionTarget }
  | { readonly kind: 'status'; readonly status: AppliedStatus; readonly amount: number; readonly to: ActionTarget }
  | { readonly kind: 'grow'; readonly amount: number; readonly to: ActionTarget }
  | { readonly kind: 'cleanse'; readonly to: ActionTarget }

export type TargetRef =
  | { readonly kind: 'player' }
  | { readonly kind: 'chosenEnemy' }
  | { readonly kind: 'token'; readonly tokenId: TokenId }
  | { readonly kind: 'enemyDef'; readonly defId: string }
  | { readonly kind: 'allies' }
  | { readonly kind: 'everyone' }

export type AdjectiveMod =
  | { readonly kind: 'outgoingDamageMul'; readonly value: number }
  | { readonly kind: 'outgoingFlat'; readonly amount: number }
  | { readonly kind: 'incomingFlat'; readonly amount: number }
  | { readonly kind: 'incomingMul'; readonly value: number }
  | { readonly kind: 'onHitPoison'; readonly amount: number }
  | { readonly kind: 'selfDamageAfter'; readonly amount: number }

export type AdverbMod =
  | { readonly kind: 'powerMul'; readonly value: number }
  | { readonly kind: 'repeat'; readonly count: number }
  | { readonly kind: 'executionBonus' }
  | { readonly kind: 'ignoreFreeze' }

export type WordEffect =
  | { readonly type: 'target'; readonly ref: TargetRef }
  | { readonly type: 'verb'; readonly range: VerbRange; readonly actions: readonly VerbAction[] }
  | { readonly type: 'adjective'; readonly mods: readonly AdjectiveMod[] }
  | { readonly type: 'adverb'; readonly mods: readonly AdverbMod[] }
  | { readonly type: 'junk' }
  | { readonly type: 'connective'; readonly mode: ConnectiveMode }

/** 연결어: 그리고(따로 실행), 그래서(절 1 피해의 절반을 절 2 위력에), 그러면서(절 1 수식어를 절 2에도). */
export type ConnectiveMode = 'and' | 'so' | 'while'

export interface WordDef {
  readonly id: WordId
  readonly text: string
  readonly kind: WordKind
  readonly rarity: Rarity
  readonly effect: WordEffect
  readonly enemyOnly: boolean
}

type WordInput = Omit<WordDef, 'enemyOnly' | 'rarity'> & Partial<Pick<WordDef, 'enemyOnly' | 'rarity'>>

function defineWords(inputs: readonly WordInput[]): Record<WordId, WordDef> {
  const words: Record<WordId, WordDef> = {}
  for (const input of inputs) {
    if (words[input.id]) throw new Error(`중복 단어 id: ${input.id}`)
    words[input.id] = { enemyOnly: false, rarity: 'common', ...input }
  }
  return words
}

const target = (ref: TargetRef) => ({ type: 'target', ref }) as const
const verb = (range: VerbRange, ...actions: VerbAction[]) => ({ type: 'verb', range, actions }) as const
const adjective = (...mods: AdjectiveMod[]) => ({ type: 'adjective', mods }) as const
const adverb = (...mods: AdverbMod[]) => ({ type: 'adverb', mods }) as const

/** spec 10.5 카드 풀과 적 전용 단어. */
export const WORDS: Record<WordId, WordDef> = defineWords([
  // 대상 명사
  { id: 'you', text: '당신', kind: 'target', rarity: 'starter', effect: target({ kind: 'player' }) },
  { id: 'mark', text: '지목', kind: 'target', rarity: 'starter', effect: target({ kind: 'chosenEnemy' }) },
  { id: 'scarecrow', text: '허수아비', kind: 'target', rarity: 'starter', effect: target({ kind: 'token', tokenId: 'scarecrow' }) },
  { id: 'golem', text: '돌골렘', kind: 'target', effect: target({ kind: 'token', tokenId: 'golem' }) },
  { id: 'allies', text: '우리', kind: 'target', rarity: 'uncommon', effect: target({ kind: 'allies' }) },
  { id: 'everyone', text: '모두', kind: 'target', rarity: 'rare', effect: target({ kind: 'everyone' }) },
  // 타동사: 공격
  { id: 'bite', text: '물어뜯는다', kind: 'verbTransitive', rarity: 'starter', effect: verb('melee', { kind: 'damage', amount: 6 }) },
  { id: 'slash', text: '벤다', kind: 'verbTransitive', effect: verb('melee', { kind: 'damage', amount: 10 }) },
  { id: 'devour', text: '삼킨다', kind: 'verbTransitive', rarity: 'uncommon', effect: verb('melee', { kind: 'damage', amount: 5, lifesteal: true }) },
  {
    id: 'sacrifice', text: '희생한다', kind: 'verbTransitive', rarity: 'uncommon',
    effect: verb('ranged', { kind: 'loseHp', amount: 6, to: 'subject' }, { kind: 'damage', amount: 15 }),
  },
  {
    id: 'embrace', text: '끌어안는다', kind: 'verbTransitive', rarity: 'uncommon',
    effect: verb('melee', { kind: 'mutualDamage', amount: 4 }, { kind: 'freeze', to: 'subject' }, { kind: 'freeze', to: 'object' }),
  },
  // 타동사: 지원·방해
  { id: 'guard', text: '막는다', kind: 'verbTransitive', rarity: 'starter', effect: verb('support', { kind: 'block', amount: 6, to: 'subject' }) },
  { id: 'mend', text: '치유한다', kind: 'verbTransitive', rarity: 'starter', effect: verb('support', { kind: 'heal', amount: 6, to: 'object' }) },
  { id: 'scare', text: '겁준다', kind: 'verbTransitive', rarity: 'starter', effect: verb('ranged', { kind: 'status', status: 'weak', amount: 2, to: 'object' }) },
  { id: 'curse', text: '저주한다', kind: 'verbTransitive', effect: verb('ranged', { kind: 'status', status: 'vulnerable', amount: 2, to: 'object' }) },
  { id: 'poisonFeed', text: '독을 먹인다', kind: 'verbTransitive', effect: verb('melee', { kind: 'status', status: 'poison', amount: 4, to: 'object' }) },
  // 자동사
  { id: 'sleep', text: '잠든다', kind: 'verbIntransitive', effect: verb('support', { kind: 'freeze', to: 'subject' }) },
  { id: 'rage', text: '분노한다', kind: 'verbIntransitive', rarity: 'starter', effect: verb('support', { kind: 'status', status: 'strength', amount: 2, to: 'subject' }) },
  { id: 'hide', text: '숨는다', kind: 'verbIntransitive', rarity: 'starter', effect: verb('support', { kind: 'block', amount: 10, to: 'subject' }) },
  { id: 'collapse', text: '무너진다', kind: 'verbIntransitive', effect: verb('support', { kind: 'loseHp', amount: 10, to: 'subject' }) },
  { id: 'swell', text: '부풀어 오른다', kind: 'verbIntransitive', effect: verb('support', { kind: 'grow', amount: 6, to: 'subject' }) },
  { id: 'recover', text: '정신 차린다', kind: 'verbIntransitive', effect: verb('support', { kind: 'cleanse', to: 'subject' }) },
  // 형용사
  { id: 'blind', text: '눈먼', kind: 'adjective', rarity: 'starter', effect: adjective({ kind: 'outgoingDamageMul', value: 0.5 }) },
  { id: 'venomous', text: '독을 뿜는', kind: 'adjective', rarity: 'starter', effect: adjective({ kind: 'onHitPoison', amount: 2 }) },
  { id: 'sturdy', text: '단단한', kind: 'adjective', effect: adjective({ kind: 'incomingFlat', amount: 3 }) },
  { id: 'giant', text: '거대한', kind: 'adjective', effect: adjective({ kind: 'outgoingDamageMul', value: 1.5 }) },
  { id: 'cracked', text: '금이 간', kind: 'adjective', effect: adjective({ kind: 'incomingMul', value: 1.5 }) },
  {
    id: 'hungry', text: '굶주린', kind: 'adjective', rarity: 'uncommon',
    effect: adjective({ kind: 'outgoingFlat', amount: 4 }, { kind: 'selfDamageAfter', amount: 2 }),
  },
  // 부사
  { id: 'fiercely', text: '격렬하게', kind: 'adverb', rarity: 'starter', effect: adverb({ kind: 'powerMul', value: 1.5 }) },
  { id: 'twice', text: '두 번', kind: 'adverb', rarity: 'rare', effect: adverb({ kind: 'repeat', count: 2 }) },
  { id: 'slowly', text: '천천히', kind: 'adverb', effect: adverb({ kind: 'powerMul', value: 0.5 }) },
  { id: 'again', text: '거듭', kind: 'adverb', rarity: 'uncommon', effect: adverb({ kind: 'executionBonus' }) },
  { id: 'persist', text: '기어이', kind: 'adverb', effect: adverb({ kind: 'ignoreFreeze' }) },
  // 적 전용
  { id: 'spider', text: '거미', kind: 'target', enemyOnly: true, effect: target({ kind: 'enemyDef', defId: 'spider' }) },
  { id: 'spiderling', text: '새끼 거미', kind: 'target', enemyOnly: true, effect: target({ kind: 'enemyDef', defId: 'spiderling' }) },
  { id: 'slime', text: '슬라임', kind: 'target', enemyOnly: true, effect: target({ kind: 'enemyDef', defId: 'slime' }) },
  { id: 'nibble', text: '깨문다', kind: 'verbTransitive', enemyOnly: true, effect: verb('melee', { kind: 'damage', amount: 3 }) },
  { id: 'crush', text: '짓누른다', kind: 'verbTransitive', enemyOnly: true, effect: verb('melee', { kind: 'damage', amount: 10 }) },
  { id: 'spiderBite', text: '물어뜯는다', kind: 'verbTransitive', enemyOnly: true, effect: verb('melee', { kind: 'damage', amount: 14 }) },
  { id: 'spiderNip', text: '문다', kind: 'verbTransitive', enemyOnly: true, effect: verb('melee', { kind: 'damage', amount: 9 }) },
  {
    id: 'curl', text: '웅크린다', kind: 'verbIntransitive', enemyOnly: true,
    effect: verb('support', { kind: 'block', amount: 8, to: 'subject' }),
  },

  // 정예·보스 전용 (런 spec §5)
  { id: 'queenBite', text: '물어뜯는다', kind: 'verbTransitive', enemyOnly: true, effect: verb('melee', { kind: 'damage', amount: 10 }) },
  { id: 'queenNip', text: '문다', kind: 'verbTransitive', enemyOnly: true, effect: verb('melee', { kind: 'damage', amount: 7 }) },
  { id: 'queenCurl', text: '웅크린다', kind: 'verbIntransitive', enemyOnly: true, effect: verb('support', { kind: 'block', amount: 10, to: 'subject' }) },
  { id: 'gateCurl', text: '버틴다', kind: 'verbIntransitive', enemyOnly: true, effect: verb('support', { kind: 'block', amount: 20, to: 'subject' }) },
  { id: 'gateCrush', text: '짓누른다', kind: 'verbTransitive', enemyOnly: true, effect: verb('melee', { kind: 'damage', amount: 16 }) },
  { id: 'scribeSlash', text: '벤다', kind: 'verbTransitive', enemyOnly: true, effect: verb('melee', { kind: 'damage', amount: 15 }) },
  {
    id: 'scribeScold', text: '꾸짖는다', kind: 'verbTransitive', enemyOnly: true,
    effect: verb('ranged', { kind: 'damage', amount: 9 }, { kind: 'status', status: 'weak', amount: 2, to: 'object' }),
  },

  // 연결어(런 보상). 연결어 칸에 놓으면 둘째 절이 열린다.
  { id: 'and', text: '그리고', kind: 'connective', effect: { type: 'connective', mode: 'and' } },
  { id: 'so', text: '그래서', kind: 'connective', rarity: 'uncommon', effect: { type: 'connective', mode: 'so' } },
  { id: 'while', text: '그러면서', kind: 'connective', rarity: 'rare', effect: { type: 'connective', mode: 'while' } },

  // 내 문장의 빈칸(v2 기본 랠리). 낭독할 때 materialize가 실제 대상으로 채운다.
  { id: 'impliedSubject', text: '당신', kind: 'target', enemyOnly: true, effect: target({ kind: 'player' }) },
  { id: 'impliedObject', text: '대상', kind: 'target', enemyOnly: true, effect: target({ kind: 'chosenEnemy' }) },
  { id: 'blankVerb', text: '___', kind: 'verbTransitive', enemyOnly: true, effect: verb('support') },
  { id: 'web', text: '거미줄', kind: 'junk', enemyOnly: true, effect: { type: 'junk' } },
])

export function getWord(id: WordId): WordDef {
  const word = WORDS[id]
  if (!word) throw new Error(`알 수 없는 단어 id: ${id}`)
  return word
}

/** 덱 편집에 쓸 수 있는 플레이어 카드 풀. */
export const PLAYER_POOL: readonly WordDef[] = Object.values(WORDS).filter((w) => !w.enemyOnly && w.kind !== 'junk')
