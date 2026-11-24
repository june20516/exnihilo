import { type RngState, shuffle } from '@/kit/core/rng'

export interface CardInstance {
  readonly instanceId: string
}

export interface DeckState<C extends CardInstance> {
  readonly drawPile: readonly C[]
  readonly hand: readonly C[]
  readonly discardPile: readonly C[]
}

export function createDeck<C extends CardInstance>(
  cards: readonly C[],
  rng: RngState,
): { deck: DeckState<C>; rng: RngState } {
  const [drawPile, nextRng] = shuffle(rng, cards)
  return { deck: { drawPile, hand: [], discardPile: [] }, rng: nextRng }
}

/** 덱이 비면 버림 더미를 한 번 섞어 보충하고, 그래도 부족하면 있는 만큼만 뽑는다. */
export function draw<C extends CardInstance>(
  deck: DeckState<C>,
  count: number,
  rng: RngState,
): { deck: DeckState<C>; rng: RngState; drawn: C[]; reshuffled: boolean } {
  let drawPile = [...deck.drawPile]
  let discardPile = [...deck.discardPile]
  let currentRng = rng
  let reshuffled = false

  if (drawPile.length < count && discardPile.length > 0) {
    const [shuffled, nextRng] = shuffle(currentRng, discardPile)
    drawPile = [...drawPile, ...shuffled]
    discardPile = []
    currentRng = nextRng
    reshuffled = true
  }

  const drawn = drawPile.slice(0, count)
  return {
    deck: { drawPile: drawPile.slice(drawn.length), hand: [...deck.hand, ...drawn], discardPile },
    rng: currentRng,
    drawn,
    reshuffled,
  }
}

export function takeFromHand<C extends CardInstance>(
  deck: DeckState<C>,
  instanceId: string,
): { deck: DeckState<C>; card: C } | null {
  const card = deck.hand.find((c) => c.instanceId === instanceId)
  if (!card) return null
  return { deck: { ...deck, hand: deck.hand.filter((c) => c !== card) }, card }
}

export function discardHand<C extends CardInstance>(deck: DeckState<C>): DeckState<C> {
  return { ...deck, hand: [], discardPile: [...deck.discardPile, ...deck.hand] }
}

export function addToDiscard<C extends CardInstance>(deck: DeckState<C>, cards: readonly C[]): DeckState<C> {
  return { ...deck, discardPile: [...deck.discardPile, ...cards] }
}
