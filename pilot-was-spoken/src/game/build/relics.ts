import type { WordId } from '@/game/content/words'
import type { RelicId } from './build'

/**
 * 유물 효과(데이터). 엔진은 유물 id가 아니라 이 효과 종류로 훅을 만든다(rally/hooks.ts).
 * 같은 종류의 효과를 가진 유물을 더 만들면 코드 변경 없이 동작한다.
 */
export type RelicEffect =
  /** 문장에 놓인 내 단어 1장마다 피해·보호·회복 기본값 +amount. */
  | { readonly kind: 'perWordBonus'; readonly amount: number }
  /** 주어를 생략한 절의 피해 기본값 +amount. */
  | { readonly kind: 'blankSubjectBonus'; readonly amount: number }
  /** 한 슬롯에 형용사가 minAdjectives개 이상이면 그 슬롯 배율 ×factor. */
  | { readonly kind: 'chainBoost'; readonly factor: number; readonly minAdjectives: number }
  /** 부사의 세기를 두 번 적용한다. */
  | { readonly kind: 'adverbTwice' }
  /** 독을 거는 모든 효과 +amount. */
  | { readonly kind: 'poisonBonus'; readonly amount: number }
  /** 생략된 주어가 이 단어(대상 명사)가 된다. */
  | { readonly kind: 'impliedSubject'; readonly word: WordId }
  /** 낭독한 첫 절의 동사 카드가 망각 대신 손패로 돌아온다. */
  | { readonly kind: 'returnFirstVerb' }
  /** 연결어 없이 낭독하면 첫 절의 반복 횟수 +amount. */
  | { readonly kind: 'soloRepeat'; readonly amount: number }

export interface RelicDef {
  readonly id: RelicId
  readonly name: string
  readonly rarity: 'common' | 'rare'
  readonly text: string
  readonly effect: RelicEffect
}

/** 문법 유물 8종 (spec §4.4). 효과의 수치는 effect에 있고, 문구는 그 수치를 그대로 쓴다. */
export const RELICS: Record<RelicId, RelicDef> = {
  longSentence: {
    id: 'longSentence', name: '긴 문장', rarity: 'common',
    text: '문장에 놓인 내 단어(연결어 포함, 꺼진 칸 제외) 1장마다 피해·보호·회복 기본값 +2',
    effect: { kind: 'perWordBonus', amount: 2 },
  },
  adjectiveChain: {
    id: 'adjectiveChain', name: '수식의 사슬', rarity: 'rare',
    text: '한 슬롯에 형용사가 2개 이상이면 그 슬롯의 배율 ×2',
    effect: { kind: 'chainBoost', factor: 2, minAdjectives: 2 },
  },
  stress: { id: 'stress', name: '강세', rarity: 'rare', text: '부사의 세기가 두 번 적용된다', effect: { kind: 'adverbTwice' } },
  ellipsis: {
    id: 'ellipsis', name: '생략의 미학', rarity: 'common', text: '주어를 생략한 절의 피해 기본값 +4',
    effect: { kind: 'blankSubjectBonus', amount: 4 },
  },
  scarecrowSpeaker: {
    id: 'scarecrowSpeaker', name: '허수아비 화자', rarity: 'common',
    text: '생략된 주어가 허수아비가 된다. 주어가 받는 보호·힘도 허수아비가 받는다',
    effect: { kind: 'impliedSubject', word: 'scarecrow' },
  },
  poisonGrammar: {
    id: 'poisonGrammar', name: '독의 문법', rarity: 'common', text: '독을 거는 모든 효과 +2',
    effect: { kind: 'poisonBonus', amount: 2 },
  },
  resonance: {
    id: 'resonance', name: '울림', rarity: 'rare', text: '낭독한 첫 절의 동사 카드는 버림 더미 대신 손패로 돌아온다',
    effect: { kind: 'returnFirstVerb' },
  },
  echo: {
    id: 'echo', name: '메아리', rarity: 'rare', text: '연결어 없이 낭독하면 첫 절의 반복 횟수 +1',
    effect: { kind: 'soloRepeat', amount: 1 },
  },
}

/** 가진 유물의 효과 목록. */
export function relicEffects(relics: readonly RelicId[]): RelicEffect[] {
  return relics.map((id) => RELICS[id].effect)
}
