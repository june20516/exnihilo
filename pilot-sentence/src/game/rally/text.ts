import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import { getWord, type Lasts, LASTS_TEXT } from '@/game/content/words'
import type { CombatEvent, RejectReason } from '@/game/combat/events'
import type { SlotRole } from '@/game/grammar/frames'
import { attachParticle } from '@/game/grammar/josa'
import { renderClause, type RenderToken } from '@/game/grammar/render'
import { getSlot, type PlacedWord } from '@/game/sentence/board'
import { wordLookup } from '@/game/build/build'
import { RALLY_RULES } from '@/game/content/balance'
import { type RallyState, runSentence } from './combat'
import { enemyIntent, nextSealRole } from './enemyTurn'
import { materializeFor } from './hooks'
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

/**
 * 이 절에서 목적어를 문구에서 생략하는가: 지원 동사의 빈 목적어가 채워진 결과 주어와 같은 대상일 때다
 * (예: "당신이 당신을 막는다" → "당신이 막는다"). 목적어 칸에 내 수식어가 있으면 생략하지 않는다.
 */
export function omitsObject(state: RallyState, clause: number): boolean {
  const verbHead = getSlot(state.board, { clause, role: 'verb' }).head
  if (verbHead.owner === 'blank') return false
  const verb = getWord(verbHead.wordId).effect
  if (verb.type !== 'verb' || verb.range !== 'support') return false
  const object = getSlot(state.board, { clause, role: 'object' })
  if (object.head.owner !== 'blank' || object.modifiers.some((m) => m !== null && m.owner === 'player')) return false
  const shown = materializeFor(state)
  const subjectHead = getSlot(shown, { clause, role: 'subject' }).head
  const objectHead = getSlot(shown, { clause, role: 'object' }).head
  return subjectHead.wordId === objectHead.wordId && subjectHead.targetEntityId === objectHead.targetEntityId
}

/** 내 문장을 절마다 한 줄로. 주어와 같은 빈 목적어는 생략한다. */
export function sentenceText(state: RallyState): string[] {
  const nameOf = wordNamer(state)
  return state.board.clauses.map((_, clause) => {
    const tokens = renderClause(state.board, clause, nameOf)
    if (!omitsObject(state, clause)) return joinTokens(tokens)
    // 목적어 토큰과, 목적어 head 바로 뒤의 조사를 뺀다.
    const kept = tokens.filter((t, i) => {
      if (t.kind !== 'particle') return t.address.role !== 'object'
      const before = tokens[i - 1]
      return !(before && before.kind === 'head' && before.address.role === 'object')
    })
    return joinTokens(kept)
  })
}

/** 적 예고 문장과, 미리보기에서 그 적이 내는 수치(피해·보호 등). 적 id → 문구. */
export function intentTexts(
  state: RallyState,
  enemyEvents: readonly CombatEvent[],
  nameOf: (word: PlacedWord) => string,
): Record<string, string> {
  const texts: Record<string, string> = {}
  let sealsAhead = 0
  RALLY_ENCOUNTERS[state.encounterId]?.enemies.forEach((_, index) => {
    const id = `e${index}`
    const intent = enemyIntent(state, index)
    const self = state.entities.find((e) => e.id === id)
    // 얼어 있는 적은 이번 차례에 빙결을 하나 쓰고 아무것도 하지 못한다(봉인 포함).
    const frozenNote = self && self.statuses.freeze > 0 ? ' — 빙결로 무효' : ''
    if (intent.kind === 'seal') {
      const name = self?.name ?? '적'
      texts[id] = `${attachParticle(name, 'subject')} 당신의 ${ROLE_NAMES[nextSealRole(state, sealsAhead)]} 칸을 봉인한다${frozenNote}`
      if (!frozenNote) sealsAhead++
      return
    }
    const sentence = joinTokens(renderClause(enemyBoard(intent.clause, id, RALLY_RULES.enemyModifierSlots), 0, nameOf))
    // 맞힐 때 거는 독은 피해 이벤트 바로 뒤에 오므로, 마지막으로 피해를 준 개체의 것으로 본다.
    let lastHitter: string | null = null
    const numbers = enemyEvents.flatMap((e) => {
      if (e.type === 'damaged') lastHitter = e.sourceId
      if (e.type === 'damaged' && e.sourceId === id) return [`피해 ${e.amount + e.blocked}`]
      if (e.type === 'statusApplied' && e.entityId === id && e.status === 'block') return [`보호 +${e.amount}`]
      if (e.type === 'statusApplied' && e.status === 'poison' && e.entityId !== id && lastHitter === id) return [`독 +${e.amount}`]
      if (e.type === 'grew' && e.entityId === id) return [`최대 HP +${e.amount}`]
      return []
    })
    texts[id] = frozenNote ? `${sentence}${frozenNote}` : numbers.length > 0 ? `${sentence} — ${numbers.join(', ')}` : sentence
  })
  return texts
}

/**
 * 개체별 형용사 상태 표시: 이미 남은 상태와, 지금 문장대로 낭독하면 남을 상태.
 * 낭독과 적 차례는 한 번에 처리되므로 화면은 "남을 상태"를 놓는 순간부터 보여 준다. 예: { e0: ['눈멂 ×2 · 적 차례까지'] }
 */
export function lingeringTexts(state: RallyState): Record<string, string[]> {
  const pending = hasVerb(state.board) ? runSentence(state).lingering : {}
  const ids = new Set([...Object.keys(state.lingering), ...Object.keys(pending)])
  const texts: Record<string, string[]> = {}
  for (const id of ids) {
    // 같은 상태 이름·같은 지속 시간끼리 묶어 센다.
    const counts = new Map<string, { name: string; lasts: Lasts; n: number }>()
    for (const wordId of [...(state.lingering[id] ?? []), ...(pending[id] ?? [])]) {
      const effect = wordLookup(state.build)(wordId).effect
      if (effect.type !== 'adjective' || !effect.stateName) continue
      const key = `${effect.stateName}|${effect.lasts}`
      const entry = counts.get(key) ?? { name: effect.stateName, lasts: effect.lasts, n: 0 }
      counts.set(key, { ...entry, n: entry.n + 1 })
    }
    if (counts.size === 0) continue
    texts[id] = [...counts.values()].map(({ name, lasts, n }) => `${name}${n > 1 ? ` ×${n}` : ''} · ${LASTS_TEXT[lasts]}`)
  }
  return texts
}

const NOTICE_TYPES: ReadonlySet<string> = new Set(['rejected', 'emptyDraw', 'burned', 'recalled'])

/**
 * 방금 일어난 일 중 플레이어에게 알릴 것 한 줄: 거절 사유가 먼저이고,
 * 없으면 서고 바닥 대가, 손패 넘침, 떠올리기를 잇는다. 없으면 빈 문자열.
 */
export function eventNotice(events: readonly CombatEvent[]): string {
  const combat = events.filter((e) => NOTICE_TYPES.has(e.type))
  const rejected = combat.find((e) => e.type === 'rejected')
  if (rejected?.type === 'rejected') return REJECT_MESSAGES[rejected.reason]
  const notes: string[] = []
  for (const e of combat) {
    if (e.type === 'emptyDraw') notes.push(`서고가 비어 HP ${e.hpLost} 잃음`)
    if (e.type === 'burned') notes.push(`손패가 가득 차 ${getWord(e.wordId).text}은(는) 망각으로`)
    if (e.type === 'recalled') notes.push(`망각에서 ${e.count}장을 떠올림`)
  }
  return notes.join(' · ')
}
