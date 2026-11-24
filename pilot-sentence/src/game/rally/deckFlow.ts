import { shuffle } from '@/kit/core/rng'
import { getWord } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import type { PlacedWord } from '@/game/sentence/board'
import type { CardInst, RallyResult as Result, RallyState } from './combat'

/** 카드 흐름: 판의 단어를 카드로 되돌리기, 손패의 동사 확인, 드로우. */

export function cardsFrom(words: readonly PlacedWord[]): CardInst[] {
  return words.flatMap((w) => (w.owner === 'player' && w.instanceId ? [{ instanceId: w.instanceId, wordId: w.wordId }] : []))
}

export function handHasVerb(hand: readonly CardInst[]): boolean {
  return hand.some((c) => getWord(c.wordId).effect.type === 'verb')
}

/** 손패 상한을 지키며 한 장씩 뽑는다. 뽑을 더미가 비면 버림 더미를 섞고, 넘치는 카드는 소각한다. */
export function drawCards(state: RallyState, count: number): Result {
  let { drawPile, hand, discardPile } = state.deck
  let rng = state.rng
  let reshuffled = false
  let drawn = 0
  const burned: CombatEvent[] = []
  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break
      const [shuffled, nextRng] = shuffle(rng, discardPile)
      drawPile = shuffled
      discardPile = []
      rng = nextRng
      reshuffled = true
    }
    const [card, ...rest] = drawPile
    drawPile = rest
    if (hand.length >= state.build.handMax) {
      discardPile = [...discardPile, card]
      burned.push({ type: 'burned', wordId: card.wordId })
    } else {
      hand = [...hand, card]
      drawn++
    }
  }
  return {
    state: { ...state, deck: { drawPile, hand, discardPile }, rng },
    events: [{ type: 'drawn', count: drawn, reshuffled }, ...burned],
  }
}
