/**
 * 한 방 천장 분석: 지금의 카드·강화·유물·구조로 한 번의 낭독이 어디까지 커질 수 있는가.
 *
 * 1. 배율 목록: 곱으로 쌓이는 원천과 그 값(강화 단계별)
 * 2. 이론 천장: 무엇이든 무한히 가졌을 때
 * 3. 마음대로 고르는 상점: 매번 가장 좋은 것을 살 수 있을 때 구매 수별 천장(탐욕)
 * 4. 실제 상점: 실제 상점 운·화폐로 6번 쇼핑했을 때(천장을 아는 구매자)의 천장 분포와,
 *    그 덱에서 손패 한 번(상한만큼)으로 실제로 지을 수 있는 한 방 분포
 *
 * 계산은 해석식으로 하고(해석기와 같은 순서·반올림), 대표 문장은 실제 엔진으로 대조한다.
 * 범위 밖: 적의 보호, 독·거듭(지속·누적 효과), 허수아비 화자. 낭독 한 번의 즉시 피해만 센다.
 *
 * 사용: npm run ceiling [-- --runs 200]
 */
import { createRng, type RngState, shuffle } from '@/kit/core/rng'
import { applyStructure, type BuildState, canUpgradeFurther, EMPTY_BUILD, effectiveWord, isUpgradable, type RelicId, withUpgrade } from '@/game/build/build'
import { RELICS, relicEffects } from '@/game/build/relics'
import { hooksFromEffects } from '@/game/rally/hooks'
import { VULNERABLE_MULTIPLIER } from '@/kit/core/entity'
import { RALLY_RULES, RUN_RULES, UPGRADE_RULES } from '@/game/content/balance'
import { RALLY_STARTER_DECK } from '@/game/content/enemies'
import { type AdjectiveMod, type AdverbMod, getWord, type WordId } from '@/game/content/words'
import { FLOORS } from '@/game/run/floors'
import { buyFrom, type Offer, priceOf, rollShop, type ShopState, STRUCTURES, WORD_POOL } from '@/game/run/shop'
import { type RallyAction, type RallyState, reduceRally, runSentence, startRally } from '@/game/rally/combat'
import { PLAYER_ID } from '@/game/content/characters'
import { readFileSync } from 'node:fs'
import { type ShopPolicy, simulateRun } from '@/game/sim/runSim'
import { type ShopWeights, weightedShopBot } from '@/game/sim/shopBots'

// ───────────────────────── 카드 분류 ─────────────────────────

type Counts = ReadonlyMap<WordId, number>

const countOf = (counts: Counts, id: WordId) => counts.get(id) ?? 0

function toCounts(ids: readonly WordId[]): Map<WordId, number> {
  const counts = new Map<WordId, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

const adjectiveMods = (id: WordId, build: BuildState): readonly AdjectiveMod[] => {
  const effect = effectiveWord(id, build).effect
  return effect.type === 'adjective' ? effect.mods : []
}
const adverbMods = (id: WordId, build: BuildState): readonly AdverbMod[] => {
  const effect = effectiveWord(id, build).effect
  return effect.type === 'adverb' ? effect.mods : []
}

/** 주어 자리에서 피해를 키우는 형용사(배율 ≥ 1 또는 가산). */
const SUBJECT_ADJ: readonly WordId[] = ['giant', 'hungry']
/** 목적어 자리에서 피해를 키우는 형용사. */
const OBJECT_ADJ: readonly WordId[] = ['cracked']
/** 사슬(형용사 2개 이상)만 채우는 자리 채움 형용사. 그 자리에서 피해를 줄이지 않는 것만. */
const SUBJECT_FILLER: readonly WordId[] = ['venomous', 'sturdy']
const OBJECT_FILLER: readonly WordId[] = ['venomous', 'blind']
const POWER_ADVERBS: readonly WordId[] = ['fiercely']
const REPEAT_ADVERBS: readonly WordId[] = ['twice']
const DAMAGE_VERBS: readonly WordId[] = ['bite', 'slash', 'devour', 'sacrifice']
/** 절 1에서 절 2를 돕는 동사: 취약(×1.5), 힘. */
const SETUP_VERBS: readonly WordId[] = ['curse', 'rage']

// ───────────────────────── 문장 설정 ─────────────────────────

interface ClauseCfg {
  readonly verb: WordId
  readonly subject: readonly WordId[]
  readonly object: readonly WordId[]
  readonly adverbs: readonly WordId[]
}

type Mode = 'single' | 'and' | 'so' | 'while'

interface Sentence {
  readonly mode: Mode
  readonly clauses: readonly ClauseCfg[]
  readonly burst: number
}

const cardsOf = (c: ClauseCfg) => 1 + c.subject.length + c.object.length + c.adverbs.length

function usage(clauses: readonly ClauseCfg[], connective: WordId | null): Map<WordId, number> {
  const ids = clauses.flatMap((c) => [c.verb, ...c.subject, ...c.object, ...c.adverbs])
  return toCounts(connective ? [...ids, connective] : ids)
}

function fits(clauses: readonly ClauseCfg[], connective: WordId | null, pool: Counts): boolean {
  for (const [id, n] of usage(clauses, connective)) if (countOf(pool, id) < n) return false
  return true
}

/** ids에서 최대 size장까지 고르는 중복 조합(풀에 있는 장수 이내). */
function multisets(ids: readonly WordId[], size: number, pool: Counts): WordId[][] {
  const available = ids.filter((id) => countOf(pool, id) > 0)
  const out: WordId[][] = []
  const walk = (start: number, current: WordId[]) => {
    out.push([...current])
    if (current.length === size) return
    for (let i = start; i < available.length; i++) {
      const id = available[i]
      if (current.filter((x) => x === id).length >= countOf(pool, id)) continue
      current.push(id)
      walk(i, current)
      current.pop()
    }
  }
  walk(0, [])
  return out
}

/** 한 절로 가능한 모든 설정(풀 장수와 슬롯 칸 수 이내). */
function clauseConfigs(pool: Counts, build: BuildState, verbs: readonly WordId[]): ClauseCfg[] {
  const subjects = multisets([...SUBJECT_ADJ, ...SUBJECT_FILLER], build.slots.subject, pool)
  const objects = multisets([...OBJECT_ADJ, ...OBJECT_FILLER], build.slots.object, pool)
  const adverbs = multisets([...POWER_ADVERBS, ...REPEAT_ADVERBS], build.slots.verb, pool).filter(
    (a) => a.filter((id) => REPEAT_ADVERBS.includes(id)).length <= 1,
  )
  const out: ClauseCfg[] = []
  for (const verb of verbs) {
    if (countOf(pool, verb) === 0) continue
    for (const subject of subjects) for (const object of objects) for (const adverb of adverbs) {
      const cfg = { verb, subject, object, adverbs: adverb }
      if (fits([cfg], null, pool)) out.push(cfg)
    }
  }
  return out
}

// ───────────────────────── 해석식 ─────────────────────────


interface ClauseContext {
  /** 긴 문장·생략·그래서가 더하는 피해 기본값. */
  readonly damageBonus: number
  readonly strength: number
  readonly vulnerable: boolean
  readonly repeatBonus: number
  /** 그러면서: 절 1에서 빌려 온 수식어. */
  readonly borrowed: ClauseCfg | null
}

/** 해석식도 엔진과 같은 유물 효과 데이터로 훅을 만든다. 주어는 생략했다고 본다(생략의 미학 최대치). */
function relicHooks(build: BuildState, wordsOnBoard: number, clauseCount: number) {
  return hooksFromEffects(relicEffects(build.relics), { countedWords: wordsOnBoard, subjectBlank: true, clause: 0, clauseCount })
}

function slotStats(ids: readonly WordId[], build: BuildState) {
  const mods = ids.flatMap((id) => adjectiveMods(id, build))
  const boost = relicHooks(build, 0, 1).chainBoost
  const chain = boost && ids.length >= boost.minAdjectives ? boost.factor : 1
  return {
    outMul: mods.reduce((p, m) => (m.kind === 'outgoingDamageMul' ? p * m.value : p), 1) * chain,
    outFlat: mods.reduce((s, m) => (m.kind === 'outgoingFlat' ? s + m.amount : s), 0),
    inMul: mods.reduce((p, m) => (m.kind === 'incomingMul' ? p * m.value : p), 1) * chain,
    inFlat: mods.reduce((s, m) => (m.kind === 'incomingFlat' ? s + m.amount : s), 0),
  }
}

function adverbStats(ids: readonly WordId[], build: BuildState) {
  const mods = ids.flatMap((id) => adverbMods(id, build))
  const power = mods.reduce((p, m) => (m.kind === 'powerMul' ? p * m.value : p), 1)
  return {
    power: relicHooks(build, 0, 1).adverbTwice ? power * power : power,
    repeat: mods.reduce((r, m) => (m.kind === 'repeat' ? Math.max(r, m.count) : r), 1),
  }
}

function verbDamage(id: WordId, build: BuildState): { damage: number; selfLoss: number } {
  const effect = effectiveWord(id, build).effect
  if (effect.type !== 'verb') return { damage: 0, selfLoss: 0 }
  let damage = 0
  let selfLoss = 0
  for (const a of effect.actions) {
    if (a.kind === 'damage') damage += a.amount
    if (a.kind === 'loseHp' && a.to === 'subject') selfLoss += a.amount
  }
  return { damage, selfLoss }
}

/** 절 하나가 적 하나에게 주는 즉시 피해(반복 포함). 자해로 죽는 문장은 -1. */
function clauseBurst(cfg: ClauseCfg, ctx: ClauseContext, build: BuildState): number {
  const borrowed = ctx.borrowed
  const subject = slotStats(borrowed ? [...cfg.subject, ...borrowed.subject] : cfg.subject, build)
  const object = slotStats(borrowed ? [...cfg.object, ...borrowed.object] : cfg.object, build)
  const adverbs = adverbStats(borrowed ? [...cfg.adverbs, ...borrowed.adverbs] : cfg.adverbs, build)
  const { damage, selfLoss } = verbDamage(cfg.verb, build)
  if (Math.floor(selfLoss * adverbs.power) >= RALLY_RULES.playerMaxHp) return -1
  if (damage === 0) return 0
  const base = damage + ctx.damageBonus
  const outgoing = (base * adverbs.power + ctx.strength + subject.outFlat) * subject.outMul
  const hit = Math.max(0, Math.floor(outgoing * (ctx.vulnerable ? VULNERABLE_MULTIPLIER : 1) * object.inMul) - object.inFlat)
  return hit * (adverbs.repeat + ctx.repeatBonus)
}

/** 절 1의 동사가 절 2에 남기는 상태. */
function setupEffect(verb: WordId, build: BuildState): { strength: number; vulnerable: boolean } {
  const effect = effectiveWord(verb, build).effect
  if (effect.type !== 'verb') return { strength: 0, vulnerable: false }
  let strength = 0
  let vulnerable = false
  for (const a of effect.actions) {
    if (a.kind === 'status' && a.status === 'strength') strength += a.amount
    if (a.kind === 'status' && a.status === 'vulnerable') vulnerable = true
  }
  return { strength, vulnerable }
}

function bonusFor(build: BuildState, wordsOnBoard: number): number {
  return relicHooks(build, wordsOnBoard, 1).damageBonus ?? 0
}

const NEUTRAL: Omit<ClauseContext, 'damageBonus'> = { strength: 0, vulnerable: false, repeatBonus: 0, borrowed: null }

function evaluate(mode: Mode, clauses: readonly ClauseCfg[], build: BuildState): number {
  // 긴 문장은 연결어 카드도 센다(해석식은 꺼진 칸에 카드를 두지 않는다).
  const words = clauses.reduce((s, c) => s + cardsOf(c), 0) + (mode === 'single' ? 0 : 1)
  const bonus = bonusFor(build, words)
  if (mode === 'single') {
    return clauseBurst(clauses[0], { ...NEUTRAL, damageBonus: bonus, repeatBonus: relicHooks(build, 0, 1).repeatBonus ?? 0 }, build)
  }
  const [first, second] = clauses
  const b1 = clauseBurst(first, { ...NEUTRAL, damageBonus: bonus }, build)
  if (b1 < 0) return -1
  const setup = setupEffect(first.verb, build)
  const b2 = clauseBurst(second, {
    damageBonus: bonus + (mode === 'so' ? Math.floor(b1 / 2) : 0),
    strength: setup.strength,
    vulnerable: setup.vulnerable,
    repeatBonus: 0,
    borrowed: mode === 'while' ? first : null,
  }, build)
  return b2 < 0 ? -1 : b1 + b2
}

const CONNECTIVE_OF: Record<Exclude<Mode, 'single'>, WordId> = { and: 'and', so: 'so', while: 'while' }

/** 풀(덱 또는 손패)과 빌드로 지을 수 있는 가장 센 문장. cardLimit은 한 번에 쥘 수 있는 장수. */
function bestSentence(pool: Counts, build: BuildState, cardLimit: number, twoClause = true): Sentence {
  let best: Sentence = { mode: 'single', clauses: [], burst: 0 }
  const consider = (mode: Mode, clauses: ClauseCfg[]) => {
    const burst = evaluate(mode, clauses, build)
    if (burst > best.burst) best = { mode, clauses, burst }
  }
  const singles = clauseConfigs(pool, build, DAMAGE_VERBS).filter((c) => cardsOf(c) <= cardLimit)
  for (const c of singles) consider('single', [c])
  if (!twoClause) return best

  const firsts = clauseConfigs(pool, build, [...DAMAGE_VERBS, ...SETUP_VERBS])
  for (const mode of ['and', 'so', 'while'] as const) {
    const connective = CONNECTIVE_OF[mode]
    if (countOf(pool, connective) === 0) continue
    for (const first of firsts) {
      const room = cardLimit - 1 - cardsOf(first)
      if (room < 1) continue
      for (const second of singles) {
        if (cardsOf(second) > room) continue
        if (!fits([first, second], connective, pool)) continue
        consider(mode, [first, second])
      }
    }
  }
  return best
}

function describe(s: Sentence): string {
  if (s.clauses.length === 0) return '(없음)'
  const clause = (c: ClauseCfg) => {
    const name = (id: WordId) => getWord(id).text
    const part = (ids: readonly WordId[]) => (ids.length ? `[${ids.map(name).join(' ')}]` : '')
    return `${part(c.subject)}당신이 ${part(c.object)}적을 ${part(c.adverbs)}${name(c.verb)}`
  }
  const joiner = s.mode === 'single' ? '' : ` ${getWord(CONNECTIVE_OF[s.mode]).text} `
  return s.clauses.map(clause).join(joiner)
}

// ───────────────────────── 엔진 대조 ─────────────────────────

const ENGINE_ENEMY_HP = 1e15

/** 같은 문장을 실제 전투 엔진에 놓고 낭독 피해를 잰다. */
function engineBurst(s: Sentence, build: BuildState): number {
  const ids = [...usage(s.clauses, s.mode === 'single' ? null : CONNECTIVE_OF[s.mode])].flatMap(([id, n]) =>
    Array.from({ length: n }, () => id),
  )
  const started = startRally('spider', ids, 1, { build: { ...build, handMax: 99 } }).state
  const cards = ids.map((wordId, i) => ({ instanceId: `x${i}`, wordId }))
  let state: RallyState = {
    ...started,
    deck: { drawPile: [], hand: cards, discardPile: [] },
    entities: started.entities.map((e) => (e.id === PLAYER_ID ? e : { ...e, hp: ENGINE_ENEMY_HP, maxHp: ENGINE_ENEMY_HP })),
  }
  const take = (wordId: WordId) => {
    const card = state.deck.hand.find((c) => c.wordId === wordId)
    if (!card) throw new Error(`손패에 없음: ${wordId}`)
    return card.instanceId
  }
  const act = (action: RallyAction) => {
    const r = reduceRally(state, action)
    const rejected = r.events.find((e) => e.type === 'rejected')
    if (rejected) throw new Error(`엔진이 거부함: ${JSON.stringify(rejected)} ${JSON.stringify(action)}`)
    state = r.state
  }
  if (s.mode !== 'single') act({ type: 'connect', instanceId: take(CONNECTIVE_OF[s.mode]) })
  s.clauses.forEach((c, clause) => {
    act({ type: 'place', instanceId: take(c.verb), at: { clause, role: 'verb' } })
    for (const id of c.subject) act({ type: 'place', instanceId: take(id), at: { clause, role: 'subject' } })
    for (const id of c.object) act({ type: 'place', instanceId: take(id), at: { clause, role: 'object' } })
    for (const id of c.adverbs) act({ type: 'place', instanceId: take(id), at: { clause, role: 'verb' } })
  })
  return runSentence(state).burst
}

// ───────────────────────── 시나리오 ─────────────────────────

/** 0 이상의 정수 인자. 잘못된 값이면 이유를 말하고 끝낸다. */
function argValue(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number.parseInt(process.argv[index + 1] ?? '', 10)
  if (!Number.isInteger(value) || value < 0) {
    console.error(`${name}는 0 이상의 정수여야 합니다.`)
    process.exit(1)
  }
  return value
}
const RUNS = argValue('--runs', 200)
const GOAL = 180

const fmt = (n: number) => String(Math.round(n)).padStart(6)
const quantile = (xs: readonly number[], q: number) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
}

function applyOffer(deck: readonly WordId[], build: BuildState, offer: Offer): { deck: WordId[]; build: BuildState } {
  switch (offer.kind) {
    case 'word':
      return { deck: [...deck, offer.wordId], build }
    case 'upgrade':
      return { deck: [...deck], build: withUpgrade(build, offer.wordId) }
    case 'structure':
      return { deck: [...deck], build: applyStructure(build, offer.id) }
    case 'relic':
      return { deck: [...deck], build: { ...build, relics: [...build.relics, offer.id] } }
  }
}

function offerName(o: Offer): string {
  switch (o.kind) {
    case 'word': return `단어 ${getWord(o.wordId).text}`
    case 'upgrade': return `강화 ${getWord(o.wordId).text}`
    case 'structure': return `구조 ${o.id}`
    case 'relic': return `유물 ${RELICS[o.id].name}`
  }
}

/** 지금 살 수 있는 모든 것(상점 운 무시). */
function everyOffer(deck: readonly WordId[], build: BuildState): Offer[] {
  const upgradable = [...new Set(deck)].filter((id) => isUpgradable(id) && canUpgradeFurther(build, id))
  const slotOf = { subjectSlot: 'subject', objectSlot: 'object', verbSlot: 'verb' } as const
  return [
    ...WORD_POOL.map((wordId): Offer => ({ kind: 'word', wordId })),
    ...upgradable.map((wordId): Offer => ({ kind: 'upgrade', wordId })),
    ...STRUCTURES.filter((id) => !(id in slotOf) || build.slots[slotOf[id as keyof typeof slotOf]] < RALLY_RULES.maxSlots).map(
      (id): Offer => ({ kind: 'structure', id }),
    ),
    ...(Object.keys(RELICS) as RelicId[]).filter((id) => !build.relics.includes(id)).map((id): Offer => ({ kind: 'relic', id })),
  ]
}

const deckCeiling = (deck: readonly WordId[], build: BuildState, twoClause = true) =>
  bestSentence(toCounts(deck), build, build.handMax, twoClause)

/** 손패 한 번: 덱을 섞어 상한만큼 뽑았을 때 지을 수 있는 가장 센 문장. */
function handSamples(deck: readonly WordId[], build: BuildState, samples: number, rng: RngState): number[] {
  const out: number[] = []
  let current = rng
  for (let i = 0; i < samples; i++) {
    const [shuffled, next] = shuffle(current, deck)
    current = next
    const hand = shuffled.slice(0, build.handMax)
    out.push(bestSentence(toCounts(hand), build, build.handMax).burst)
  }
  return out
}

let sectionStarted = Date.now()
function section(title: string) {
  if (process.argv.includes('--timing')) console.log(`(이전 구간 ${((Date.now() - sectionStarted) / 1000).toFixed(1)}초)`)
  sectionStarted = Date.now()
  console.log(`\n━━ ${title} ━━`)
}

// 1. 배율 목록
section('1. 곱으로 쌓이는 원천 (강화 0 / 1 / 2단계)')
const levelBuild = (id: WordId, level: number): BuildState =>
  level === 0 ? EMPTY_BUILD : { ...EMPTY_BUILD, upgrades: { [id]: level } }
const modValue = (id: WordId, level: number) => {
  const b = levelBuild(id, level)
  const adj = adjectiveMods(id, b).find((m) => m.kind === 'outgoingDamageMul' || m.kind === 'incomingMul' || m.kind === 'outgoingFlat')
  if (adj) return 'value' in adj ? `×${adj.value}` : `+${adj.amount}`
  const adv = adverbMods(id, b).find((m) => m.kind === 'powerMul' || m.kind === 'repeat')
  if (adv) return adv.kind === 'powerMul' ? `×${adv.value}` : `×${adv.count}회`
  return `${verbDamage(id, b).damage}`
}
for (const id of ['bite', 'slash', 'sacrifice', 'giant', 'hungry', 'cracked', 'fiercely', 'twice']) {
  const w = getWord(id)
  console.log(`${w.text.padEnd(8)} (${w.rarity.padEnd(8)}) ${Array.from({ length: UPGRADE_RULES.maxLevel + 1 }, (_, l) => modValue(id, l).padStart(6)).join(' ')}`)
}
console.log('유물: 강세 = 부사 세기 제곱 · 사슬 = 형용사 2개 이상 슬롯 ×2 · 메아리 = 첫 절 한 번 더(연결어 없을 때) · 긴 문장 = 단어당 기본값 +2 · 생략 +4')
console.log('연결어: 그리고 = 두 절 · 그래서 = 절 1 피해 절반을 절 2 기본값에 · 그러면서 = 절 1 수식어를 절 2에도')

// 2. 시작 덱
section('2. 시작 덱 (구매 0)')
const starter = deckCeiling(RALLY_STARTER_DECK, EMPTY_BUILD)
console.log(`덱 전체에서 최고: ${starter.burst}  ${describe(starter)}`)
const starterHands = handSamples(RALLY_STARTER_DECK, EMPTY_BUILD, 400, createRng(7))
console.log(`손패 8장 한 번: 중앙 ${quantile(starterHands, 0.5)} · 상위 25% ${quantile(starterHands, 0.75)} · 최대 ${Math.max(...starterHands)}`)

// 3. 이론 천장: 모든 단어 4장, 모든 강화 2단계, 모든 유물, 칸 4/4/4, 손패 상한별
section('3. 이론 천장 (모든 단어 4장 · 모두 2단계 강화 · 유물 8종 · 칸 4/4/4)')
const everything = WORD_POOL.flatMap((id) => [id, id, id, id])
const maxBuild: BuildState = {
  slots: { subject: RALLY_RULES.maxSlots, object: RALLY_RULES.maxSlots, verb: RALLY_RULES.maxSlots },
  handMax: 8,
  discardsPerTurn: 1,
  upgrades: Object.fromEntries(WORD_POOL.map((id) => [id, 2 as const])),
  relics: Object.keys(RELICS) as RelicId[],
}
const theoretical = bestSentence(toCounts(everything), maxBuild, maxBuild.handMax)
console.log(`손패  8장: ${fmt(theoretical.burst)}  ${describe(theoretical)}`)
for (const handMax of [10, 13]) {
  const s = bestSentence(toCounts(everything), { ...maxBuild, handMax }, handMax, false)
  console.log(`손패 ${String(handMax).padStart(2)}장: ${fmt(s.burst)}  ${describe(s)}  (한 절만)`)
}

// 4. 마음대로 고르는 상점(탐욕): 매 구매마다 천장을 가장 많이 올리는 것
section('4. 마음대로 고르는 상점 — 구매할 때마다 천장을 가장 올리는 것을 산다 (상점 운 무시)')
console.log('구매  누적 기본가   천장  (산 것)  → 문장')
let greedyFinal: { deck: WordId[]; build: BuildState } = { deck: [...RALLY_STARTER_DECK], build: EMPTY_BUILD }
{
  let deck: WordId[] = [...RALLY_STARTER_DECK]
  let build = EMPTY_BUILD
  let spent = 0
  for (let n = 1; n <= 12; n++) {
    let pick: { offer: Offer; burst: number; deck: WordId[]; build: BuildState } | null = null
    for (const offer of everyOffer(deck, build)) {
      const next = applyOffer(deck, build, offer)
      const burst = deckCeiling(next.deck, next.build).burst
      if (!pick || burst > pick.burst || (burst === pick.burst && priceOf(offer) < priceOf(pick.offer))) {
        pick = { offer, burst, ...next }
      }
    }
    if (!pick) break
    deck = pick.deck
    build = pick.build
    spent += priceOf(pick.offer)
    const s = deckCeiling(deck, build)
    console.log(`${String(n).padStart(3)} ${fmt(spent)}      ${fmt(s.burst)}  (${offerName(pick.offer)})  → ${describe(s)}`)
  }
  greedyFinal = { deck, build }
}
const totalGold = FLOORS.slice(0, -1).reduce((s, f) => s + RUN_RULES.rewardGold[f.tier], 0)
console.log(`런 전체 화폐: ${totalGold} (같은 상점에서 둘째 구매는 ×1.5, 셋째는 ×2.25)`)

// 5. 실제 상점 운 + 천장을 아는 구매자
section(`5. 실제 상점 (${RUNS}런) — 천장을 아는 구매자가 상점마다 가장 좋은 조합을 산다`)

interface Purchase { readonly deck: WordId[]; readonly build: BuildState; readonly gold: number; readonly bought: Offer[] }

/** 상점 하나에서 살 수 있는 모든 순서를 따져 천장이 가장 높아지는 구매(같으면 덜 쓰는 쪽). */
function bestShopping(shop: ShopState, start: Purchase): Purchase {
  let best = start
  let bestScore = deckCeiling(start.deck, start.build).burst
  const walk = (state: ShopState, current: Purchase) => {
    state.items.forEach((item, index) => {
      if (item.sold || item.price > current.gold) return
      const applied = applyOffer(current.deck, current.build, item.offer)
      const next: Purchase = { ...applied, gold: current.gold - item.price, bought: [...current.bought, item.offer] }
      const score = deckCeiling(next.deck, next.build).burst
      if (score > bestScore || (score === bestScore && next.gold > best.gold)) {
        best = next
        bestScore = score
      }
      walk(buyFrom(state, index), next)
    })
  }
  walk(shop, start)
  return best
}

const ceilings: number[] = []
const handMedians: number[] = []
const handTop: number[] = []
const handGoalRate: number[] = []
const purchaseCounts: number[] = []
let exampleShown = 0
for (let seed = 1001; seed < 1001 + RUNS; seed++) {
  let rng = createRng(seed)
  let state: Purchase = { deck: [...RALLY_STARTER_DECK], build: EMPTY_BUILD, gold: 0, bought: [] }
  for (const floor of FLOORS.slice(0, -1)) {
    state = { ...state, gold: state.gold + RUN_RULES.rewardGold[floor.tier] }
    const [shop, next] = rollShop(rng, state.deck, state.build)
    rng = next
    state = bestShopping(shop, state)
  }
  const ceiling = deckCeiling(state.deck, state.build)
  ceilings.push(ceiling.burst)
  purchaseCounts.push(state.bought.length)
  const hands = handSamples(state.deck, state.build, 60, rng)
  handMedians.push(quantile(hands, 0.5))
  handTop.push(quantile(hands, 0.75))
  handGoalRate.push(hands.filter((h) => h >= GOAL).length / hands.length)
  if (exampleShown < 2 && seed % 50 === 1) {
    exampleShown++
    console.log(`예 seed ${seed}: 산 것 ${state.bought.map(offerName).join(', ')}`)
    console.log(`  천장 ${ceiling.burst}  ${describe(ceiling)}`)
  }
}
const row = (label: string, xs: readonly number[]) =>
  console.log(`${label.padEnd(22)} 하위25% ${fmt(quantile(xs, 0.25))} · 중앙 ${fmt(quantile(xs, 0.5))} · 상위25% ${fmt(quantile(xs, 0.75))} · 최대 ${fmt(Math.max(...xs))}`)
row('구매 수', purchaseCounts)
row('덱 천장(완벽한 손패)', ceilings)
row('손패 한 번 · 중앙', handMedians)
row('손패 한 번 · 상위 25%', handTop)
console.log(`천장이 ${GOAL} 이상인 런: ${((ceilings.filter((c) => c >= GOAL).length / RUNS) * 100).toFixed(0)}%`)
console.log(`손패 한 번에 ${GOAL} 이상이 나올 확률(런 평균): ${((handGoalRate.reduce((a, b) => a + b, 0) / RUNS) * 100).toFixed(1)}%`)

// 6. 엔진 대조: 대표 문장을 실제 엔진에서 다시 계산
section('6. 엔진 대조')
const checks: [string, Sentence, BuildState][] = [
  ['시작 덱 최고', starter, EMPTY_BUILD],
  ['이론 천장(손패 8)', theoretical, maxBuild],
  ['탐욕 구매 마지막(두 절)', deckCeiling(greedyFinal.deck, greedyFinal.build), greedyFinal.build],
]
let mismatch = 0
for (const [label, s, b] of checks) {
  const engine = engineBurst(s, b)
  const ok = engine === s.burst
  if (!ok) mismatch++
  console.log(`${ok ? '일치' : '불일치'}  ${label}: 해석식 ${s.burst} · 엔진 ${engine}`)
}
if (mismatch > 0) process.exitCode = 1

// 7. 구매만 바꾼 실제 런: 전투는 기존 봇(twoPlyBot), 상점은 천장을 아는 구매자
const SIM_RUNS = argValue('--sim', 0)
if (SIM_RUNS > 0) {
  section(`7. 실제 런 ${SIM_RUNS}회 — 전투는 기존 봇, 상점만 천장을 아는 구매자`)
  const sameOffer = (a: Offer, b: Offer) => JSON.stringify(a) === JSON.stringify(b)
  const ceilingShopBot: ShopPolicy = (run, rng) => {
    if (!run.shop) return [{ type: 'leave' }, rng]
    const plan = bestShopping(run.shop, { deck: [...run.deck], build: run.build, gold: run.gold, bought: [] })
    const first = plan.bought[0]
    const index = first ? run.shop.items.findIndex((item) => !item.sold && sameOffer(item.offer, first)) : -1
    return index >= 0 ? [{ type: 'buy', index }, rng] : [{ type: 'leave' }, rng]
  }
  const results = Array.from({ length: SIM_RUNS }, (_, i) => simulateRun(1001 + i, ceilingShopBot))
  const bursts = results.map((r) => r.bestBurst)
  const won = results.filter((r) => r.outcome === 'won').length
  console.log(`완주 ${((won / SIM_RUNS) * 100).toFixed(0)}% · 평균 도달 층 ${(results.reduce((a, r) => a + r.floorReached, 0) / SIM_RUNS).toFixed(1)}`)
  row('런 최고 한 방', bursts)
  const parsed: unknown = JSON.parse(readFileSync(new URL('../src/game/sim/learnedWeights.json', import.meta.url), 'utf8'))
  if (!isShopWeights(parsed)) throw new Error('learnedWeights.json 형식이 맞지 않습니다.')
  const learned = Array.from({ length: SIM_RUNS }, (_, i) => simulateRun(1001 + i, weightedShopBot(parsed)))
  const learnedWon = learned.filter((r) => r.outcome === 'won').length
  console.log(`비교(같은 시드, 학습 봇): 완주 ${((learnedWon / SIM_RUNS) * 100).toFixed(0)}%`)
  row('  학습 봇 런 최고 한 방', learned.map((r) => r.bestBurst))
}

function isShopWeights(value: unknown): value is ShopWeights {
  return typeof value === 'object' && value !== null && 'kinds' in value && 'saveThreshold' in value
}
