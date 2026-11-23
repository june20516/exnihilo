import type { RelicId } from './build'

export interface RelicDef {
  readonly id: RelicId
  readonly name: string
  readonly rarity: 'common' | 'rare'
  readonly text: string
}

/** 문법 유물 8종 (spec §4.4). 효과는 rally/combat.ts의 clauseHooks와 해석기 훅에서 적용한다. */
export const RELICS: Record<RelicId, RelicDef> = {
  longSentence: { id: 'longSentence', name: '긴 문장', rarity: 'common', text: '문장에 놓인 내 단어(연결어 포함, 꺼진 칸 제외) 1장마다 피해·보호·회복 기본값 +2' },
  adjectiveChain: { id: 'adjectiveChain', name: '수식의 사슬', rarity: 'rare', text: '한 슬롯에 형용사가 2개 이상이면 그 슬롯의 배율 ×2' },
  stress: { id: 'stress', name: '강세', rarity: 'rare', text: '부사의 세기가 두 번 적용된다' },
  ellipsis: { id: 'ellipsis', name: '생략의 미학', rarity: 'common', text: '주어를 생략한 절의 피해 기본값 +4' },
  scarecrowSpeaker: { id: 'scarecrowSpeaker', name: '허수아비 화자', rarity: 'common', text: '생략된 주어가 허수아비가 된다. 주어가 받는 보호·힘도 허수아비가 받는다' },
  poisonGrammar: { id: 'poisonGrammar', name: '독의 문법', rarity: 'common', text: '독을 거는 모든 효과 +2' },
  resonance: { id: 'resonance', name: '울림', rarity: 'rare', text: '낭독한 첫 절의 동사 카드는 버림 더미 대신 손패로 돌아온다' },
  echo: { id: 'echo', name: '메아리', rarity: 'rare', text: '연결어 없이 낭독하면 첫 절의 반복 횟수 +1' },
}
