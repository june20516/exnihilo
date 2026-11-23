import { BALANCE } from '@/game/content/balance'
import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import { getWord } from '@/game/content/words'
import type { CombatEvent, RejectReason } from '@/game/combat/events'
import type { SlotRole } from '@/game/grammar/frames'
import { attachParticle } from '@/game/grammar/josa'
import { renderClause, type RenderToken } from '@/game/grammar/render'
import { getSlot, type PlacedWord } from '@/game/sentence/board'
import { enemyIntent, materializeFor, nextSealRole, type RallyState } from './combat'
import { enemyBoard, hasVerb } from './sentence'

/** 화면과 텍스트 플레이가 함께 쓰는 문장·문구. */

const ROLE_NAMES: Record<SlotRole, string> = { subject: '주어', object: '목적어', verb: '동사' }

export const REJECT_MESSAGES: Record<RejectReason, string> = {
  kindMismatch: '그 자리에는 이 품사를 놓을 수 없습니다.',
  modifiersFull: '수식어 칸이 가득 찼습니다. 바꿀 칸을 직접 고르세요.',
  slotInactive: '지금 문장에는 그 칸이 없습니다(자동사에는 목적어가 없고, 둘째 절은 연결어를 놓아야 열립니다).',
  unplayable: '사용할 수 없는 단어입니다.',
  noTarget: '대상을 고르세요.',
  notPlayerTurn: '지금은 행동할 수 없습니다.',
  deckEmpty: '뽑을 카드가 없습니다.',
  noVerb: '동사가 있어야 낭독할 수 있습니다.',
  slotSealed: '봉인된 칸입니다. 다음 적 차례가 시작되면 풀립니다.',
  notEnoughGold: '화폐가 모자랍니다.',
  soldOut: '이미 샀거나 없는 보상입니다.',
  noDiscardLeft: '이번 턴에는 더 버릴 수 없습니다.',
}

/** 렌더 토큰을 한 줄 문장으로: 단어 사이는 띄우고 조사는 붙인다. */
export function joinTokens(tokens: readonly RenderToken[]): string {
  return tokens.reduce((text, token) => (token.kind === 'particle' || text === '' ? text + token.text : `${text} ${token.text}`), '')
}

/** 이 단어가 놓인 내 문장의 절과 역할. */
function locate(state: RallyState, word: PlacedWord): { clause: number; role: SlotRole } | null {
  for (const [clause, c] of state.board.clauses.entries()) {
    const slot = c.slots.find((s) => s.head === word)
    if (slot) return { clause, role: slot.role }
  }
  return null
}

/**
 * 단어의 표시 이름. 내 문장의 빈칸은 낭독하면 채워질 실제 대상의 이름으로 보인다.
 * 동사를 놓기 전의 빈 목적어는 지정한 적의 이름(없으면 '대상')이다.
 */
export function wordNamer(state: RallyState): (word: PlacedWord) => string {
  const shown = materializeFor(state)
  const entityName = (id: string | null) => (id && state.entities.find((e) => e.id === id)?.name) || null
  return (word) => {
    if (word.owner === 'blank' && word.wordId !== 'blankVerb') {
      const at = locate(state, word)
      if (at?.role === 'object' && !hasVerb(state.board)) return entityName(state.targetId) ?? '대상'
      const filled = at ? getSlot(shown, at).head : word
      return entityName(filled.targetEntityId) ?? getWord(filled.wordId).text
    }
    return entityName(word.targetEntityId) ?? getWord(word.wordId).text
  }
}

/** 내 문장을 절마다 한 줄로. */
export function sentenceText(state: RallyState): string[] {
  const nameOf = wordNamer(state)
  return state.board.clauses.map((_, clause) => joinTokens(renderClause(state.board, clause, nameOf)))
}

/** 적 예고 문장과, 미리보기에서 그 적이 내는 수치(피해·보호 등). 적 id → 문구. */
export function intentTexts(
  state: RallyState,
  enemyEvents: readonly CombatEvent[],
  nameOf: (word: PlacedWord) => string,
): Record<string, string> {
  const texts: Record<string, string> = {}
  RALLY_ENCOUNTERS[state.encounterId]?.enemies.forEach((_, index) => {
    const id = `e${index}`
    const intent = enemyIntent(state, index)
    if (intent.kind === 'seal') {
      const name = state.entities.find((e) => e.id === id)?.name ?? '적'
      texts[id] = `${attachParticle(name, 'subject')} 당신의 ${ROLE_NAMES[nextSealRole(state)]} 칸을 봉인한다`
      return
    }
    const sentence = joinTokens(renderClause(enemyBoard(intent.clause, id, BALANCE.maxModifiers), 0, nameOf))
    const numbers = enemyEvents.flatMap((e) => {
      if (e.type === 'damaged' && e.sourceId === id) return [`피해 ${e.amount + e.blocked}`]
      if (e.type === 'statusApplied' && e.entityId === id && e.status === 'block') return [`보호 +${e.amount}`]
      if (e.type === 'grew' && e.entityId === id) return [`최대 HP +${e.amount}`]
      return []
    })
    texts[id] = numbers.length > 0 ? `${sentence} — ${numbers.join(', ')}` : sentence
  })
  return texts
}
