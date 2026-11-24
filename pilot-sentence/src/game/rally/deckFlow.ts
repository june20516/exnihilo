import { isAlive, loseHp } from '@/kit/core/entity'
import { shuffle } from '@/kit/core/rng'
import { RALLY_RULES } from '@/game/content/balance'
import { PLAYER_ID } from '@/game/content/characters'
import type { CombatEvent } from '@/game/combat/events'
import type { PlacedWord } from '@/game/sentence/board'
import type { CardInst, RallyResult as Result, RallyState } from './combat'

/** 손패 밖 기본 동사 타일의 instanceId. 판에 놓여도 손패·서고·망각 어디에도 들어가지 않는다. */
export const BASIC_VERB_INSTANCE = 'basic'

/** 카드 흐름: 판의 단어를 카드로 되돌리기, 손패의 동사 확인, 드로우. */

export function cardsFrom(words: readonly PlacedWord[]): CardInst[] {
  // 기본 동사 타일은 카드가 아니므로 돌려주지 않는다(제자리로 돌아간다).
  return words.flatMap((w) => (w.owner === 'player' && w.instanceId && w.instanceId !== BASIC_VERB_INSTANCE ? [{ instanceId: w.instanceId, wordId: w.wordId }] : []))
}


/**
 * 서고에서 한 장씩 뽑는다. 망각은 저절로 돌아오지 않는다(v3 규칙 spec §3.2).
 * 서고가 바닥나면 뽑지 못한 장수 × emptyDrawHpLoss만큼 플레이어가 HP를 잃는다(보호·감소 무시).
 * 손패 상한을 넘는 카드는 망각으로 간다(소각).
 */
export function drawCards(state: RallyState, count: number): Result {
  let { drawPile, hand, discardPile } = state.deck
  let drawn = 0
  let missing = 0
  const burned: CombatEvent[] = []
  for (let i = 0; i < count; i++) {
    const [card, ...rest] = drawPile
    if (!card) {
      missing++
      continue
    }
    drawPile = rest
    if (hand.length >= state.build.handMax) {
      discardPile = [...discardPile, card]
      burned.push({ type: 'burned', wordId: card.wordId })
    } else {
      hand = [...hand, card]
      drawn++
    }
  }
  const events: CombatEvent[] = []
  let entities = state.entities
  if (missing > 0) {
    let hpLost = 0
    entities = entities.map((e) => {
      if (e.id !== PLAYER_ID) return e
      const r = loseHp(e, missing * RALLY_RULES.emptyDrawHpLoss)
      hpLost = r.lost
      return r.entity
    })
    events.push({ type: 'emptyDraw', missing, hpLost })
    const player = entities.find((e) => e.id === PLAYER_ID)
    if (player && !isAlive(player)) events.push({ type: 'died', entityId: PLAYER_ID })
  }
  events.push({ type: 'drawn', count: drawn }, ...burned)
  const hpLost = events.reduce((sum, e) => (e.type === 'emptyDraw' ? sum + e.hpLost : sum), 0)
  const log = hpLost > 0 ? { ...state.log, emptyDrawHpLost: state.log.emptyDrawHpLost + hpLost } : state.log
  return { state: { ...state, entities, log, deck: { drawPile, hand, discardPile } }, events }
}

/** 떠올리기: 망각에서 무작위로 count장(모자라면 있는 만큼)을 골라 서고에 섞어 넣는다. */
export function recallCards(state: RallyState, count: number): Result {
  const { discardPile, drawPile } = state.deck
  const [shuffled, afterPick] = shuffle(state.rng, discardPile)
  const picked = shuffled.slice(0, count)
  const pickedIds = new Set(picked.map((c) => c.instanceId))
  const [newDraw, rng] = shuffle(afterPick, [...drawPile, ...picked])
  return {
    state: { ...state, rng, deck: { ...state.deck, drawPile: newDraw, discardPile: discardPile.filter((c) => !pickedIds.has(c.instanceId)) } },
    events: [{ type: 'recalled', count: picked.length }],
  }
}
