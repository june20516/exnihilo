import type { Entity, Side } from '@/kit/core/entity'
import { buildFor } from '@/game/build/build'
import { RELICS } from '@/game/build/relics'
import { RALLY_RULES } from '@/game/content/balance'
import { CHARACTERS, DEFAULT_CHARACTER, PLAYER_ID } from '@/game/content/characters'
import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import { type AppliedStatus, getWord, type WordId } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import type { SlotRole } from '@/game/grammar/frames'
import type { RallyState } from './combat'
import { enemyIntent, nextSealRole } from './enemyTurn'
import { previewEvents } from './preview'

/**
 * 화면이 그릴 구조값: 미리보기(개체별 변화), 적 예고의 행동, 적용 중인 증폭 요소, 서고·망각 내용.
 * 수치는 모두 미리보기(실제 엔진)에서 나오므로 실제 결과와 같다.
 */

export type ChangeChipKind =
  | 'damage' | 'blocked' | 'heal' | 'hpLoss' | 'grow' | 'block' | 'poison' | 'weak' | 'vulnerable' | 'strength' | 'freeze'
  | 'cleanse' | 'emptyDraw' | 'summoned'

export interface ChangeChip {
  readonly kind: ChangeChipKind
  readonly amount: number
  /** 보호의 이월 턴 수. */
  readonly holds?: number
}

export interface EntityChange {
  readonly id: string
  readonly name: string
  readonly side: Side
  readonly hpBefore: number
  readonly hpAfter: number
  readonly maxHp: number
  readonly chips: readonly ChangeChip[]
  readonly died: boolean
}

interface Tally {
  hp: number
  maxHp: number
  died: boolean
  chips: ChangeChip[]
}

/** 같은 종류(보호는 같은 이월)의 칩은 하나로 더한다. */
function addChip(chips: ChangeChip[], chip: ChangeChip): void {
  const same = chips.findIndex((c) => c.kind === chip.kind && c.holds === chip.holds)
  if (same < 0) chips.push(chip)
  else chips[same] = { ...chips[same], amount: chips[same].amount + chip.amount }
}

/** 이벤트를 개체별 변화로 접는다. start는 구간 시작 시점의 HP. 변화가 있는 개체만 돌려준다. */
function changesFrom(events: readonly CombatEvent[], start: ReadonlyMap<string, { hp: number; maxHp: number }>, entities: readonly Entity[]): EntityChange[] {
  const tallies = new Map<string, Tally>()
  const tally = (id: string): Tally => {
    let t = tallies.get(id)
    if (!t) {
      const known = start.get(id) ?? entities.find((e) => e.id === id) ?? { hp: 0, maxHp: 0 }
      t = { hp: known.hp, maxHp: known.maxHp, died: false, chips: [] }
      tallies.set(id, t)
    }
    return t
  }
  for (const e of events) {
    switch (e.type) {
      case 'damaged': {
        const t = tally(e.entityId)
        t.hp -= e.amount
        if (e.amount > 0) addChip(t.chips, { kind: 'damage', amount: e.amount })
        if (e.blocked > 0) addChip(t.chips, { kind: 'blocked', amount: e.blocked })
        break
      }
      case 'healed':
        tally(e.entityId).hp += e.amount
        addChip(tally(e.entityId).chips, { kind: 'heal', amount: e.amount })
        break
      case 'hpLost':
      case 'poisonTick':
        tally(e.entityId).hp -= e.amount
        addChip(tally(e.entityId).chips, { kind: e.type === 'hpLost' ? 'hpLoss' : 'poison', amount: e.amount })
        break
      case 'grew': {
        const t = tally(e.entityId)
        t.hp += e.amount
        t.maxHp += e.amount
        addChip(t.chips, { kind: 'grow', amount: e.amount })
        break
      }
      case 'statusApplied':
        addChip(tally(e.entityId).chips, e.status === 'block' ? { kind: 'block', amount: e.amount, holds: e.holds ?? 0 } : { kind: e.status, amount: e.amount })
        break
      case 'cleansed':
        addChip(tally(e.entityId).chips, { kind: 'cleanse', amount: 0 })
        break
      case 'emptyDraw': {
        const t = tally(PLAYER_ID)
        t.hp -= e.hpLost
        addChip(t.chips, { kind: 'emptyDraw', amount: e.hpLost })
        break
      }
      case 'summoned': {
        const spawned = entities.find((x) => x.id === e.entityId)
        tallies.set(e.entityId, { hp: spawned?.maxHp ?? 0, maxHp: spawned?.maxHp ?? 0, died: false, chips: [{ kind: 'summoned', amount: 0 }] })
        break
      }
      case 'died':
        tally(e.entityId).died = true
        break
      default:
        break
    }
  }
  return [...tallies].map(([id, t]) => {
    const entity = entities.find((x) => x.id === id)
    const before = start.get(id)
    return {
      id,
      name: entity?.name ?? id,
      side: entity?.side ?? 'ally',
      hpBefore: before?.hp ?? t.maxHp,
      hpAfter: Math.max(0, t.hp),
      maxHp: t.maxHp,
      chips: t.chips,
      died: t.died,
    }
  })
}

/** 미리보기: 내 낭독 구간과 이어지는 적 차례 구간의 개체별 변화. */
export function previewSummary(state: RallyState): { mine: EntityChange[]; enemy: EntityChange[] } {
  const { mine, enemy, after } = previewEvents(state)
  const start = new Map(state.entities.map((e) => [e.id, { hp: e.hp, maxHp: e.maxHp }]))
  const mineChanges = changesFrom(mine, start, after.entities)
  const middle = new Map(start)
  for (const c of mineChanges) middle.set(c.id, { hp: c.hpAfter, maxHp: c.maxHp })
  return { mine: mineChanges, enemy: changesFrom(enemy, middle, after.entities) }
}

// ───────────────────────── 적 예고 ─────────────────────────

export type IntentAction =
  | { readonly kind: 'attack'; readonly amount: number; readonly target: string }
  | { readonly kind: 'block'; readonly amount: number; readonly holds: number }
  | { readonly kind: 'seal'; readonly role: SlotRole; readonly fizzled: boolean }
  | { readonly kind: 'status'; readonly status: AppliedStatus; readonly amount: number }
  | { readonly kind: 'grow'; readonly amount: number }
  | { readonly kind: 'fizzled' }

/** 적 차례 이벤트를 절 단위로 나눈다(clauseExecuted가 한 적의 절의 시작). */
function enemyClauseGroups(events: readonly CombatEvent[]): CombatEvent[][] {
  const groups: CombatEvent[][] = []
  for (const e of events) {
    if (e.type === 'clauseExecuted') groups.push([])
    else groups[groups.length - 1]?.push(e)
  }
  return groups
}

/** 적마다 이번 차례에 할 행동과 수치. 수치는 미리보기의 적 차례(실제 엔진)에서 그 적이 낸 결과다. */
export function intentActions(state: RallyState): Record<string, IntentAction[]> {
  const { enemy, after } = previewEvents(state)
  const groups = enemyClauseGroups(enemy)
  const nameOf = (id: string) => after.entities.find((e) => e.id === id)?.name ?? state.entities.find((e) => e.id === id)?.name ?? id
  const result: Record<string, IntentAction[]> = {}
  let sealsAhead = 0
  let clauseIndex = 0
  RALLY_ENCOUNTERS[state.encounterId]?.enemies.forEach((_, index) => {
    const id = `e${index}`
    const self = state.entities.find((e) => e.id === id)
    if (!self || self.hp <= 0) return
    const frozen = self.statuses.freeze > 0
    const intent = enemyIntent(state, index)
    if (intent.kind === 'seal') {
      result[id] = [{ kind: 'seal', role: nextSealRole(state, sealsAhead), fizzled: frozen }]
      if (!frozen) sealsAhead++
      return
    }
    const group = groups[clauseIndex++] ?? []
    if (group.some((e) => e.type === 'fizzled')) {
      result[id] = [{ kind: 'fizzled' }]
      return
    }
    const actions: IntentAction[] = []
    for (const e of group) {
      if (e.type === 'damaged' && e.sourceId === id) actions.push({ kind: 'attack', amount: e.amount + e.blocked, target: nameOf(e.entityId) })
      else if (e.type === 'statusApplied' && e.status === 'block' && e.entityId === id) actions.push({ kind: 'block', amount: e.amount, holds: e.holds ?? 0 })
      else if (e.type === 'grew' && e.entityId === id) actions.push({ kind: 'grow', amount: e.amount })
      else if (e.type === 'statusApplied' && e.status !== 'block' && e.status !== 'freeze') actions.push({ kind: 'status', status: e.status, amount: e.amount })
    }
    result[id] = actions
  })
  return result
}

// ───────────────────────── 증폭 요소 ─────────────────────────

export interface Amplifier {
  readonly kind: 'relic' | 'structure' | 'upgrade' | 'status'
  readonly name: string
  readonly text: string
}

const ROLE_SLOT_NAMES: Readonly<Record<SlotRole, string>> = { subject: '주어 수식어 칸', object: '목적어 수식어 칸', verb: '동사 수식어 칸' }
const PLAYER_STATUSES = [
  { kind: 'strength', name: '힘', sign: '+' },
  { kind: 'weak', name: '약화', sign: '' },
  { kind: 'vulnerable', name: '취약', sign: '' },
] as const

/** 적용 중인 증폭 요소: 유물, 시작보다 늘어난 구조, 강화한 단어, 내 상태(힘·약화·취약). */
export function amplifiers(state: RallyState): Amplifier[] {
  const base = buildFor(CHARACTERS[DEFAULT_CHARACTER])
  const build = state.build
  const list: Amplifier[] = build.relics.map((id) => ({ kind: 'relic', name: RELICS[id].name, text: RELICS[id].text }))
  for (const role of ['subject', 'object', 'verb'] as const) {
    const extra = build.slots[role] - base.slots[role]
    if (extra > 0) list.push({ kind: 'structure', name: ROLE_SLOT_NAMES[role], text: `+${extra} (${build.slots[role]}칸)` })
  }
  if (build.handMax > base.handMax) list.push({ kind: 'structure', name: '손패 최대치', text: `+${build.handMax - base.handMax} (${build.handMax}장)` })
  if (build.discardsPerTurn > base.discardsPerTurn) {
    list.push({ kind: 'structure', name: '턴당 버리기', text: `+${build.discardsPerTurn - base.discardsPerTurn} (${build.discardsPerTurn}회)` })
  }
  for (const [wordId, level] of Object.entries(build.upgrades)) list.push({ kind: 'upgrade', name: getWord(wordId).text, text: `${level}단계` })
  const player = state.entities.find((e) => e.id === PLAYER_ID)
  for (const s of PLAYER_STATUSES) {
    const amount = player?.statuses[s.kind] ?? 0
    if (amount > 0) list.push({ kind: 'status', name: s.name, text: `${s.sign}${amount}` })
  }
  return list
}

// ───────────────────────── 서고·망각 ─────────────────────────

/** 서고(순서를 감추고 단어별 장수, 많은 순)와 망각(들어간 순서), 서고 바닥 대가. */
export function pileContents(state: RallyState): { draw: { wordId: WordId; count: number }[]; discard: WordId[]; emptyDrawHpLoss: number } {
  const counts = new Map<WordId, number>()
  for (const card of state.deck.drawPile) counts.set(card.wordId, (counts.get(card.wordId) ?? 0) + 1)
  const draw = [...counts].map(([wordId, count]) => ({ wordId, count })).sort((a, b) => b.count - a.count || getWord(a.wordId).text.localeCompare(getWord(b.wordId).text, 'ko'))
  return { draw, discard: state.deck.discardPile.map((c) => c.wordId), emptyDrawHpLoss: RALLY_RULES.emptyDrawHpLoss }
}
