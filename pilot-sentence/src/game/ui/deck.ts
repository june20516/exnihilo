import { STARTER_DECK } from '@/game/content/encounters'
import { WORDS, type WordId } from '@/game/content/words'

export const DECK_LIMITS = { min: 12, max: 20 } as const
export const DECK_STORAGE_KEY = 'pilot-sentence.deck'

export type DeckValidation = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export function validateDeck(ids: readonly WordId[]): DeckValidation {
  if (ids.length < DECK_LIMITS.min || ids.length > DECK_LIMITS.max) {
    return { ok: false, reason: `덱은 ${DECK_LIMITS.min}~${DECK_LIMITS.max}장이어야 합니다(지금 ${ids.length}장).` }
  }
  for (const id of ids) {
    const word = WORDS[id]
    if (!word || word.enemyOnly || word.kind === 'junk') return { ok: false, reason: `덱에 넣을 수 없는 단어: ${id}` }
  }
  return { ok: true }
}

/** 저장된 덱을 읽는다. 없거나 깨졌거나 무효면 시작 덱. */
export function loadDeck(raw: string | null): WordId[] {
  if (raw === null) return [...STARTER_DECK]
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((x): x is string => typeof x === 'string') && validateDeck(parsed).ok) {
      return parsed
    }
  } catch {
    // 깨진 값은 시작 덱으로 대체한다
  }
  return [...STARTER_DECK]
}
