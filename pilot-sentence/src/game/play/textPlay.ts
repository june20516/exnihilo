/**
 * 텍스트 플레이(런 spec §8): 터미널 명령으로 런을 한 단계씩 진행한다. 플레이테스터 에이전트가 쓴다.
 * 순수 모듈이다. 상태 파일 읽기·쓰기는 scripts/play.ts가 맡는다.
 */
import type { Entity, StatusKind } from '@/kit/core/entity'
import type { BuildState } from '@/game/build/build'
import { RELICS } from '@/game/build/relics'
import type { Balance } from '@/game/content/balance'
import { type EncounterTier, RALLY_ENCOUNTERS } from '@/game/content/enemies'
import { getWord, type WordId } from '@/game/content/words'
import type { CombatEvent } from '@/game/combat/events'
import type { SlotRole } from '@/game/grammar/frames'
import { PLAYER_ID, type RallyAction, type RallyState } from '@/game/rally/combat'
import { sentenceFormula } from '@/game/rally/formulaText'
import { linesFromEvents } from '@/game/rally/lines'
import { previewEvents } from '@/game/rally/preview'
import { intentTexts, REJECT_MESSAGES, sentenceText, wordNamer } from '@/game/rally/text'
import { FLOORS } from '@/game/run/floors'
import { type RunAction, type RunEvent, type RunState, reduceRun, startRun } from '@/game/run/run'
import { cardText, offerDetail, offerName, upgradeSummary } from '@/game/run/labels'
import { describeWord, ROLE_NAMES } from '@/game/ui/describe'

// ───────────────────────── 명령 ─────────────────────────

export type PlaceRole = SlotRole | 'connective'
/** 손패 번호(1부터) 또는 카드 id(예: c3). id는 다른 카드를 놓아도 바뀌지 않는다. */
export type CardRef = number | string

export type PlayCommand =
  | { readonly type: 'new'; readonly seed: number }
  | { readonly type: 'show' }
  | { readonly type: 'place'; readonly hand: CardRef; readonly clause: number; readonly role: PlaceRole; readonly modifier: number | null }
  | { readonly type: 'target'; readonly enemy: number }
  | { readonly type: 'discard'; readonly hands: readonly CardRef[] }
  | { readonly type: 'clear' }
  | { readonly type: 'cast' }
  | { readonly type: 'end' }
  | { readonly type: 'buy'; readonly item: number }
  | { readonly type: 'leave' }

export const USAGE = [
  '명령 (번호는 모두 1부터):',
  '  new [시드]                              새 런',
  '  show                                    지금 화면',
  '  place <손패#|카드id> <절#> <주어|목적어|동사|연결어> [칸#]',
  '                                          카드를 놓는다. 형용사는 주어·목적어, 부사는 동사에. 칸#로 수식어 자리를 고른다',
  '  target <적#>                            빈 목적어가 가리킬 적',
  '  discard <손패#|카드id...>               버리고 그만큼 다시 뽑는다(턴당 횟수 제한)',
  '  (카드 id는 손패 목록의 괄호 안 값. 놓을 때마다 손패 번호가 당겨지므로 여러 장을 놓을 땐 id가 안전하다)',
  '  clear                                   놓은 카드를 모두 손패로',
  '  cast                                    낭독(그다음 적 차례)',
  '  end                                     낭독하지 않고 턴 종료',
  '  buy <보상#>                             상점에서 산다',
  '  leave                                   상점을 떠나 다음 층으로',
].join('\n')

const ROLE_WORDS: Record<string, PlaceRole> = { 주어: 'subject', 목적어: 'object', 동사: 'verb', 연결어: 'connective' }

type ParseResult = PlayCommand | { readonly error: string }

/** 1 이상의 정수. 아니면 null. */
function positive(text: string | undefined): number | null {
  if (text === undefined || !/^\d+$/.test(text)) return null
  const n = Number(text)
  return n >= 1 ? n : null
}

/** 손패 번호 또는 카드 id. 아니면 null. */
function cardRef(text: string | undefined): CardRef | null {
  if (text !== undefined && /^[a-z]\w*$/.test(text)) return text
  return positive(text)
}

export function parseCommand(args: readonly string[]): ParseResult {
  const [name, ...rest] = args
  const need = (what: string): ParseResult => ({ error: `${what}\n\n${USAGE}` })
  switch (name) {
    case 'new': {
      if (rest.length === 0) return { type: 'new', seed: 1 }
      const seed = positive(rest[0])
      return seed === null ? need('시드는 1 이상의 정수입니다.') : { type: 'new', seed }
    }
    case 'show':
    case 'clear':
    case 'cast':
    case 'end':
    case 'leave':
      return { type: name }
    case 'place': {
      const hand = cardRef(rest[0])
      const clause = positive(rest[1])
      const role = rest[2] === undefined ? undefined : ROLE_WORDS[rest[2]]
      if (hand === null || clause === null || role === undefined) return need('place <손패#> <절#> <주어|목적어|동사|연결어> [칸#]')
      if (rest[3] === undefined) return { type: 'place', hand, clause, role, modifier: null }
      const modifier = positive(rest[3])
      return modifier === null ? need('칸#은 1 이상의 정수입니다.') : { type: 'place', hand, clause, role, modifier }
    }
    case 'target': {
      const enemy = positive(rest[0])
      return enemy === null ? need('target <적#>') : { type: 'target', enemy }
    }
    case 'discard': {
      const hands = rest.map(cardRef)
      if (hands.length === 0 || hands.some((h) => h === null)) return need('discard <손패#|카드id...>')
      return { type: 'discard', hands: hands.filter((h): h is CardRef => h !== null) }
    }
    case 'buy': {
      const item = positive(rest[0])
      return item === null ? need('buy <보상#>') : { type: 'buy', item }
    }
    default:
      return need(name === undefined ? '명령을 주세요.' : `모르는 명령: ${name}`)
  }
}

// ───────────────────────── 실행 ─────────────────────────

export interface PlayResult {
  readonly state: RunState | null
  readonly output: string
}

/** 번호를 실제 id로 바꾼 런 행동. 번호가 틀리면 문구. */
function toRunAction(state: RunState, command: Exclude<PlayCommand, { type: 'new' | 'show' }>): RunAction | string {
  const combat = (action: RallyAction): RunAction => ({ type: 'combat', action })
  const hand = state.combat?.deck.hand ?? []
  const cardAt = (ref: CardRef) => (typeof ref === 'number' ? hand[ref - 1] : hand.find((c) => c.instanceId === ref))?.instanceId
  const missingCard = (ref: CardRef) => (typeof ref === 'number' ? `손패에 ${ref}번 카드가 없습니다.` : `손패에 ${ref} 카드가 없습니다.`)
  switch (command.type) {
    case 'place': {
      const instanceId = cardAt(command.hand)
      if (!instanceId) return missingCard(command.hand)
      if (command.role === 'connective') return combat({ type: 'connect', instanceId })
      return combat({
        type: 'place',
        instanceId,
        at: { clause: command.clause - 1, role: command.role },
        modifierIndex: command.modifier === null ? undefined : command.modifier - 1,
      })
    }
    case 'target': {
      const enemies = state.combat?.entities.filter((e) => e.side === 'enemy') ?? []
      const enemy = enemies[command.enemy - 1]
      return enemy ? combat({ type: 'target', entityId: enemy.id }) : `${command.enemy}번 적이 없습니다.`
    }
    case 'discard': {
      const ids = command.hands.map(cardAt)
      const missing = command.hands.find((_, i) => !ids[i])
      if (missing !== undefined) return missingCard(missing)
      return combat({ type: 'discard', instanceIds: ids.filter((id): id is string => id !== undefined) })
    }
    case 'clear':
      return combat({ type: 'clear' })
    case 'cast':
      return combat({ type: 'cast' })
    case 'end':
      return combat({ type: 'endTurn' })
    case 'buy':
      return { type: 'buy', index: command.item - 1 }
    case 'leave':
      return { type: 'leave' }
  }
}

export function runCommand(state: RunState | null, command: PlayCommand, balance: Balance): PlayResult {
  if (command.type === 'new') {
    const started = startRun(command.seed, balance).state
    return { state: started, output: `새 런 (시드 ${command.seed})\n\n${renderRun(started, balance)}` }
  }
  if (!state) return { state: null, output: `진행 중인 런이 없습니다. 먼저 new [시드]로 시작하세요.\n\n${USAGE}` }
  if (command.type === 'show') return { state, output: renderRun(state, balance) }

  const action = toRunAction(state, command)
  if (typeof action === 'string') return { state, output: `${action}\n\n${renderRun(state, balance)}` }
  const before = state
  const result = reduceRun(state, action, balance)
  const log = [...describeEvents(result.events, before, result.state), ...(command.type === 'place' ? displacedLines(before, result.state) : [])]
  return { state: result.state, output: `${log.length > 0 ? `${log.join('\n')}\n\n` : ''}${renderRun(result.state, balance)}` }
}

// ───────────────────────── 이벤트 기록 ─────────────────────────

const RUN_ONLY = ['floorCleared', 'bought', 'runEnded'] as const
type RunOnlyEvent = Extract<RunEvent, { type: (typeof RUN_ONLY)[number] }>

function isRunOnly(event: RunEvent): event is RunOnlyEvent {
  return (RUN_ONLY as readonly string[]).includes(event.type)
}

/** 명령 하나가 일으킨 일. 결과 문장 사이에 차례 경계·봉인·뽑기 같은 표식을 끼운다. */
function describeEvents(events: readonly RunEvent[], before: RunState, after: RunState): string[] {
  const entities: Entity[] = [...(before.combat?.entities ?? []), ...(after.combat?.entities ?? [])]
  const lines: string[] = []
  for (const event of events) {
    if (isRunOnly(event)) {
      if (event.type === 'floorCleared') lines.push(`★ ${event.floor}층 통과 · 화폐 +${event.gold}`)
      if (event.type === 'bought') lines.push(`${offerName(event.offer, before.build)}을(를) ${event.price}에 샀습니다.`)
      if (event.type === 'runEnded') lines.push(event.outcome === 'won' ? '★ 런 완주!' : '✗ 런 패배')
      continue
    }
    const marker = markerLine(event)
    if (marker) lines.push(marker)
    for (const line of linesFromEvents([event], entities)) lines.push(`  ${line.text}`)
  }
  return lines
}

/** 놓기로 밀려나 손패로 돌아온 내 카드. */
function displacedLines(before: RunState, after: RunState): string[] {
  const onBoard = new Set(
    (before.combat?.board.clauses ?? []).flatMap((c) => c.slots.flatMap((slot) => [slot.head, ...slot.modifiers]))
      .flatMap((w) => (w && w.owner === 'player' && w.instanceId ? [w.instanceId] : [])),
  )
  return (after.combat?.deck.hand ?? [])
    .filter((card) => onBoard.has(card.instanceId))
    .map((card) => `  ${getWord(card.wordId).text}은(는) 밀려나 손패로 돌아갔습니다.`)
}

function markerLine(event: CombatEvent): string | null {
  switch (event.type) {
    case 'rejected':
      return `거부: ${REJECT_MESSAGES[event.reason]}`
    case 'cast':
      return event.by === 'player' ? '— 낭독 —' : null
    case 'enemyTurn':
      return '— 적 차례 —'
    case 'sealed':
      return `  봉인: 당신의 ${ROLE_NAMES[event.role]} 칸 (다음 적 차례 시작에 풀림)`
    case 'drawn':
      return `— 내 차례: ${event.count}장 뽑음${event.reshuffled ? ' (버림 더미를 섞음)' : ''} —`
    case 'burned':
      return `  손패가 가득 차 ${getWord(event.wordId).text}은(는) 버림 더미로`
    case 'discarded':
      return `${event.count}장 버림`
    case 'connected':
      return `연결어 ${getWord(event.wordId).text}: 절 2가 열렸습니다.`
    case 'combatEnded':
      return event.outcome === 'won' ? '전투 승리' : '전투 패배'
    default:
      return null
  }
}

// ───────────────────────── 화면 ─────────────────────────

const TIER_NAMES: Record<EncounterTier, string> = { normal: '일반', elite: '정예', boss: '보스' }
const STATUS_NAMES: Record<StatusKind, string> = { block: '보호', poison: '독', freeze: '빙결', strength: '힘', weak: '약화', vulnerable: '취약' }

function statusText(entity: Entity): string {
  const parts = (Object.keys(STATUS_NAMES) as StatusKind[])
    .filter((k) => entity.statuses[k] > 0)
    .map((k) => `${STATUS_NAMES[k]} ${entity.statuses[k]}`)
  return parts.length > 0 ? ` · ${parts.join(' · ')}` : ''
}

function deckSummary(deck: readonly WordId[], build: BuildState): string {
  const counts = new Map<WordId, number>()
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1)
  const items = [...counts].map(([id, n]) => {
    const level = build.upgrades[id]
    return `${getWord(id).text}${level ? `+${level}` : ''}${n > 1 ? ` ×${n}` : ''}`
  })
  return `덱 ${deck.length}장: ${items.join(', ')}`
}

function buildSummary(build: BuildState): string {
  const upgrades = upgradeSummary(build)
  const relics = build.relics.length > 0 ? build.relics.map((id) => `${RELICS[id].name}(${RELICS[id].text})`).join(', ') : '없음'
  return [
    `수식어 칸: 주어 ${build.slots.subject} · 목적어 ${build.slots.object} · 동사 ${build.slots.verb} · 손패 상한 ${build.handMax} · 턴당 버리기 ${build.discardsPerTurn}`,
    `유물: ${relics}`,
    `강화: ${upgrades.length > 0 ? upgrades.join(', ') : '없음'}`,
  ].join('\n')
}

function header(state: RunState, title: string): string {
  return `━━ ${state.floor}/${FLOORS.length}층 · ${title} ━━\nHP ${state.hp}/${state.maxHp} · 화폐 ${state.gold}`
}

function renderCombat(state: RunState, combat: RallyState, balance: Balance): string {
  const encounter = RALLY_ENCOUNTERS[combat.encounterId]
  const player = combat.entities.find((e) => e.id === PLAYER_ID)
  const enemies = combat.entities.filter((e) => e.side === 'enemy')
  const nameOf = wordNamer(combat)
  const preview = previewEvents(combat, balance)
  const intents = intentTexts(combat, preview.enemy, nameOf)
  const out: string[] = []

  out.push(`━━ ${state.floor}/${FLOORS.length}층 · ${TIER_NAMES[encounter?.tier ?? 'normal']} · ${encounter?.name ?? combat.encounterId} ━━`)
  out.push(
    `HP ${player?.hp ?? 0}/${player?.maxHp ?? state.maxHp}${player ? statusText(player) : ''} · 화폐 ${state.gold} · 턴 ${combat.turn}` +
      ` · 남은 버리기 ${combat.discardsLeft} · 뽑을 더미 ${combat.deck.drawPile.length} · 버림 더미 ${combat.deck.discardPile.length}`,
  )
  out.push('', '적')
  enemies.forEach((e, i) => {
    const alive = e.hp > 0
    out.push(`  ${i + 1}. ${e.name} HP ${e.hp}/${e.maxHp}${statusText(e)}${combat.targetId === e.id ? ' [지정]' : ''}${alive ? '' : ' (쓰러짐)'}`)
    if (alive && intents[e.id]) out.push(`     예고: ${intents[e.id]}`)
  })

  out.push('', '내 문장')
  const lines = sentenceText(combat)
  combat.board.clauses.forEach((clause, index) => {
    out.push(`  절 ${index + 1}: ${lines[index] ?? ''}`)
    for (const slot of clause.slots) {
      const mods = slot.modifiers.map((m, i) => `칸${i + 1} ${m ? nameOf(m) : '·'}`).join(' ')
      out.push(`    ${ROLE_NAMES[slot.role]}${slot.sealed ? ' [봉인]' : ''}: ${nameOf(slot.head)} | ${mods}`)
    }
  })
  out.push(
    combat.connective
      ? `  연결어: ${getWord(combat.connective.wordId).text} — ${describeWord(getWord(combat.connective.wordId))}`
      : '  연결어: (비어 있음 — 연결어 카드를 놓으면 절 2가 열립니다)',
  )
  for (const f of sentenceFormula(combat)) out.push(`  계산식 절 ${f.clause + 1}: ${f.text}`)

  out.push('', '미리보기')
  // 낭독으로 새로 생긴 개체(허수아비 등)의 이름도 찾도록 낭독 뒤의 개체 목록을 쓴다.
  const mine = linesFromEvents(preview.mine, preview.after.entities)
  const enemyLines = linesFromEvents(preview.enemy, preview.after.entities)
  out.push(`  내 낭독: ${mine.length > 0 ? mine.map((l) => l.text).join(' / ') : '(동사를 놓으면 보입니다)'}`)
  out.push(`  그다음 적 차례: ${enemyLines.length > 0 ? enemyLines.map((l) => l.text).join(' / ') : '(없음)'}`)

  out.push('', `손패 (${combat.deck.hand.length}/${combat.build.handMax})`)
  combat.deck.hand.forEach((card, i) => out.push(`  ${i + 1}. (${card.instanceId}) ${cardText(card.wordId, combat.build)}`))
  out.push('', buildSummary(state.build), deckSummary(state.deck, state.build))
  return out.join('\n')
}

function renderShop(state: RunState): string {
  const out: string[] = [header(state, `상점 (${state.floor}층 통과)`), '']
  state.shop?.items.forEach((item, i) => {
    const price = item.sold ? '팔림' : `${item.price} 화폐`
    const detail = item.sold ? '' : ` — ${offerDetail(item.offer, state.build)}`
    out.push(`  ${i + 1}. ${offerName(item.offer, state.build, !item.sold)}${detail} · ${price}`)
  })
  out.push('', `buy <번호>로 사고, leave로 다음 층(${state.floor + 1}/${FLOORS.length})으로 갑니다. 하나를 사면 남은 보상의 값이 ×1.5 오릅니다. 남은 화폐는 이월됩니다.`)
  out.push('', buildSummary(state.build), deckSummary(state.deck, state.build))
  return out.join('\n')
}

function renderEnd(state: RunState): string {
  const title = state.phase === 'won' ? '런 완주!' : `패배 (${state.floor}/${FLOORS.length}층)`
  const bought = state.log.purchases.length > 0 ? state.log.purchases.map((o) => offerName(o, state.build)).join(', ') : '없음'
  return [
    `━━ ${title} ━━`,
    `도달 ${state.floor}/${FLOORS.length}층 · 최대 한 방 ${state.log.bestBurst}`,
    `층별 턴: ${state.log.floorTurns.map((f) => `${f.floor}층 ${f.turns}턴`).join(', ') || '없음'}`,
    `산 것: ${bought}`,
    '',
    buildSummary(state.build),
    deckSummary(state.deck, state.build),
    '',
    'new [시드]로 새 런을 시작합니다.',
  ].join('\n')
}

export function renderRun(state: RunState, balance: Balance): string {
  if (state.phase === 'won' || state.phase === 'lost') return renderEnd(state)
  if (state.phase === 'shop') return renderShop(state)
  return state.combat ? renderCombat(state, state.combat, balance) : header(state, '전투 없음')
}
