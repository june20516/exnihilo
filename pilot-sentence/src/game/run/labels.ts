/** 상점 보상·카드 문구. 화면(상점)과 텍스트 플레이가 함께 쓴다. */
import { type BuildState, effectiveWord, type StructureId, withUpgrade } from '@/game/build/build'
import { RELICS } from '@/game/build/relics'
import { getWord, type WordId } from '@/game/content/words'
import type { WordKind } from '@/game/grammar/frames'
import { describeWord } from '@/game/ui/describe'
import type { Offer } from './shop'

export const KIND_NAMES: Record<WordKind, string> = {
  target: '명사', verbTransitive: '타동사', verbIntransitive: '자동사', adjective: '형용사', adverb: '부사', junk: '오염', connective: '연결어',
}
export const STRUCTURE_NAMES: Record<StructureId, string> = {
  subjectSlot: '주어 수식어 칸 +1', objectSlot: '목적어 수식어 칸 +1', verbSlot: '동사 수식어 칸 +1', handSize: '손패 상한 +1', discard: '턴당 버리기 +1',
}
/** 카드 한 줄: 이름(+강화 단계) [품사] 효과. */
export function cardText(wordId: WordId, build: BuildState): string {
  const def = effectiveWord(wordId, build)
  const level = build.upgrades[wordId]
  return `${def.text}${level ? `+${level}` : ''} [${KIND_NAMES[def.kind]}] ${describeWord(def)}`
}

const KIND_TAGS: Record<Offer['kind'], string> = { word: '단어', upgrade: '강화', structure: '구조', relic: '유물' }

/** 보상 이름(종류 접두어 없음). withLevel이면 강화 보상에 '지금→다음 단계'를 붙인다(아직 사지 않은 상점 보상에만). */
export function offerTitle(offer: Offer, build: BuildState, withLevel = false): string {
  switch (offer.kind) {
    case 'word':
      return getWord(offer.wordId).text
    case 'upgrade': {
      const level = build.upgrades[offer.wordId] ?? 0
      return withLevel ? `${getWord(offer.wordId).text} ${level}→${level + 1}단계` : getWord(offer.wordId).text
    }
    case 'structure':
      return STRUCTURE_NAMES[offer.id]
    case 'relic':
      return RELICS[offer.id].name
  }
}

/** 종류 접두어를 붙인 보상 이름. 예: '[유물] 강세'. */
export function offerName(offer: Offer, build: BuildState, withLevel = false): string {
  return `[${KIND_TAGS[offer.kind]}] ${offerTitle(offer, build, withLevel)}`
}

export function offerDetail(offer: Offer, build: BuildState): string {
  switch (offer.kind) {
    case 'word':
      return cardText(offer.wordId, build)
    case 'upgrade': {
      const next = withUpgrade(build, offer.wordId)
      return `${describeWord(effectiveWord(offer.wordId, build))} → ${describeWord(effectiveWord(offer.wordId, next))} (덱의 같은 카드 전부)`
    }
    case 'structure':
      return STRUCTURE_NAMES[offer.id]
    case 'relic':
      return RELICS[offer.id].text
  }
}

/** 강화한 단어와 지금 단계. 예: '격렬하게 2단계'. */
export function upgradeSummary(build: BuildState): string[] {
  return Object.entries(build.upgrades).map(([id, level]) => `${getWord(id).text} ${level}단계`)
}
