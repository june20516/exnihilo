import type { BlockChunk } from '@/kit/core/entity'
import { type BuildState, effectiveWord } from '@/game/build/build'
import { TOKENS } from '@/game/content/tokens'
import { type AdjectiveMod, type AdverbMod, type AppliedStatus, type ConnectiveMode, getWord, LASTS_TEXT, type VerbAction, type WordDef, type WordId } from '@/game/content/words'
import type { SlotRole } from '@/game/grammar/frames'
import { attachParticle } from '@/game/grammar/josa'

export const ROLE_NAMES: Record<SlotRole, string> = { subject: '주어', object: '목적어', verb: '동사' }

const STATUS_NAMES: Record<AppliedStatus, string> = { poison: '독', weak: '약화', vulnerable: '취약', strength: '힘' }

/** 조사 부분만(예: '거미' + object → '를'). */
const particleOf = (word: string, kind: Parameters<typeof attachParticle>[1]) => attachParticle(word, kind).slice(word.length)

/** 수치를 글로 바꾸는 방식. 강화 카드는 '기본→지금'으로 쓴다. */
type NumText = (value: number) => string
const plain: NumText = (value) => String(value)

function describeAction(action: VerbAction, num: NumText = plain): string {
  const role = (to: 'subject' | 'object') => ROLE_NAMES[to]
  switch (action.kind) {
    case 'damage':
      return action.lifesteal ? `피해 ${num(action.amount)}, 준 만큼 회복` : `피해 ${num(action.amount)}`
    case 'mutualDamage':
      return `서로 피해 ${num(action.amount)}`
    case 'loseHp':
      return `${role(action.to)} HP −${num(action.amount)}`
    case 'block':
      return action.holds > 0 ? `${role(action.to)}에게 보호 ${num(action.amount)} · ${action.holds}턴 유지` : `${role(action.to)}에게 보호 ${num(action.amount)}`
    case 'counter':
      return '주어의 보호만큼 피해, 보호를 모두 씀'
    case 'recall':
      return `망각에서 ${num(action.amount)}장을 서고로`
    case 'heal':
      return `${role(action.to)} 회복 ${num(action.amount)}`
    case 'freeze':
      return `${attachParticle(role(action.to), 'subject')} 다음 행동을 못 한다`
    case 'status': {
      const amount = action.status === 'strength' ? `+${num(action.amount)}` : `${num(action.amount)}`
      return `${role(action.to)}에게 ${STATUS_NAMES[action.status]} ${amount}`
    }
    case 'grow':
      return `${role(action.to)} 최대 HP +${num(action.amount)}`
    case 'cleanse':
      return `${role(action.to)}의 독·약화·빙결 제거`
  }
}

function describeAdjective(mod: AdjectiveMod, num: NumText = plain): string {
  switch (mod.kind) {
    case 'outgoingDamageMul':
      return `주는 피해 ×${num(mod.value)}`
    case 'outgoingFlat':
      return `주는 피해 +${num(mod.amount)}`
    case 'incomingFlat':
      return `받는 피해 −${num(mod.amount)}`
    case 'incomingMul':
      return `받는 피해 ×${num(mod.value)}`
    case 'onHitPoison':
      return `피해를 주면 독 ${num(mod.amount)}`
    case 'selfDamageAfter':
      return `실행 후 자신 HP −${num(mod.amount)}`
  }
}

function describeAdverb(mod: AdverbMod, num: NumText = plain): string {
  switch (mod.kind) {
    case 'powerMul':
      return `동사 위력 ×${num(mod.value)}`
    case 'repeat':
      return `동사를 ${num(mod.count)}번 실행`
    case 'executionBonus':
      return '지금까지 실행 횟수만큼 위력 +1'
    case 'ignoreFreeze':
      return '잠든 주어도 실행한다'
  }
}

/** 손패 타일 하단에 표시할 한 줄 설명. */
const CONNECTIVE_TEXT: Record<ConnectiveMode, string> = {
  and: '둘째 절을 연다. 두 절을 따로 실행',
  so: '둘째 절을 연다. 절 1 피해의 절반이 절 2 위력에',
  while: '둘째 절을 연다. 절 1의 수식어가 절 2에도',
}

export function describeWord(def: WordDef): string {
  const effect = def.effect
  switch (effect.type) {
    case 'junk':
      return '사용할 수 없다'
    case 'connective':
      return CONNECTIVE_TEXT[effect.mode]
    case 'target': {
      const ref = effect.ref
      switch (ref.kind) {
        case 'player':
          return '나 자신을 가리킨다'
        case 'chosenEnemy':
          return '적 하나를 가리킨다'
        case 'enemyDef':
          return '적을 가리킨다'
        case 'allies':
          return '나와 아군 전원을 가리킨다'
        case 'everyone':
          return '적까지 포함한 전원을 가리킨다'
        case 'token': {
          const token = TOKENS[ref.tokenId]
          return `${token.name}(HP ${token.hp})${particleOf(token.name, 'object')} 불러낸다`
        }
      }
      break
    }
    case 'verb': {
      const text = effect.actions.map((a) => describeAction(a)).join(', ')
      return def.kind === 'verbIntransitive' ? `${text} (자동사)` : text
    }
    case 'adjective':
      return `${effect.mods.map((m) => describeAdjective(m)).join(', ')} · ${LASTS_TEXT[effect.lasts]}`
    case 'adverb':
      return effect.mods.map((m) => describeAdverb(m)).join(', ')
  }
  return ''
}

/** 보호 덩어리를 한 줄로: 합과, 이월하는 몫의 남은 턴(예: "보호 10 · 4는 2턴 유지"). 보호가 없으면 빈 문자열. */
export function blockText(chunks: readonly BlockChunk[]): string {
  const total = chunks.reduce((sum, c) => sum + c.amount, 0)
  if (total === 0) return ''
  const holding = chunks.filter((c) => c.turnsLeft > 0).map((c) => `${c.amount}는 ${c.turnsLeft}턴 유지`)
  return [`보호 ${total}`, ...holding].join(' · ')
}

// ───────────────────────── 카드 설명 구조값 ─────────────────────────

/** 카드 사실의 종류. 화면은 이 종류로 아이콘·색을 고른다(ui/icons.ts). */
export type FactKind =
  | 'damage' | 'block' | 'heal' | 'poison' | 'weak' | 'vulnerable' | 'strength' | 'freeze' | 'hpLoss' | 'grow' | 'cleanse'
  | 'recall' | 'counter' | 'outMul' | 'outFlat' | 'inMul' | 'inFlat' | 'selfDamage' | 'power' | 'repeat' | 'again' | 'persist'
  | 'target' | 'summon' | 'connective' | 'junk'

/** 카드 효과 하나. base는 강화 전 값이고, 강화로 바뀌지 않았으면 null이다. */
export interface CardFact {
  readonly kind: FactKind
  readonly text: string
  readonly value: number | null
  readonly base: number | null
  readonly to: 'subject' | 'object' | null
}

export interface CardFacts {
  readonly facts: readonly CardFact[]
  readonly tone: 'attack' | 'support' | 'modifier' | 'target' | 'other'
  readonly badges: readonly string[]
}

/** 수치가 있는 효과에서 그 수치(강화 전후 비교용). */
function actionValue(action: VerbAction): number | null {
  return 'amount' in action ? action.amount : null
}
function modValue(mod: AdjectiveMod | AdverbMod): number | null {
  if ('value' in mod) return mod.value
  if ('amount' in mod) return mod.amount
  if ('count' in mod) return mod.count
  return null
}

const ACTION_KIND: Record<VerbAction['kind'], FactKind> = {
  damage: 'damage', mutualDamage: 'damage', loseHp: 'hpLoss', block: 'block', counter: 'counter', recall: 'recall',
  heal: 'heal', freeze: 'freeze', status: 'poison', grow: 'grow', cleanse: 'cleanse',
}
const ADJECTIVE_KIND: Record<AdjectiveMod['kind'], FactKind> = {
  outgoingDamageMul: 'outMul', outgoingFlat: 'outFlat', incomingFlat: 'inFlat', incomingMul: 'inMul', onHitPoison: 'poison', selfDamageAfter: 'selfDamage',
}
const ADVERB_KIND: Record<AdverbMod['kind'], FactKind> = { powerMul: 'power', repeat: 'repeat', executionBonus: 'again', ignoreFreeze: 'persist' }

/** 사실 하나를 만든다. 강화로 값이 바뀌었으면 문구에 '기본→지금'을 쓴다. */
function fact(kind: FactKind, value: number | null, base: number | null, to: CardFact['to'], text: (num: NumText) => string): CardFact {
  const upgraded = value !== null && base !== null && base !== value
  const num: NumText = upgraded ? (v) => `${base}→${v}` : plain
  return { kind, value, base: upgraded ? base : null, to, text: text(num) }
}

/** 카드(단어) 설명의 구조값: 효과 사실들, 색 계열(tone), 배지(지속·이월·자동사). 강화를 반영한다. */
export function cardFacts(wordId: WordId, build: BuildState): CardFacts {
  const original = getWord(wordId)
  const def = effectiveWord(wordId, build)
  const effect = def.effect
  const originalEffect = original.effect
  switch (effect.type) {
    case 'verb': {
      const before = originalEffect.type === 'verb' ? originalEffect.actions : []
      const facts = effect.actions.map((action, i) => {
        const kind: FactKind = action.kind === 'status' ? action.status : ACTION_KIND[action.kind]
        const to = 'to' in action ? action.to : null
        const baseAction = before[i]
        return fact(kind, actionValue(action), baseAction ? actionValue(baseAction) : null, to, (num) => describeAction(action, num))
      })
      const holds = effect.actions.flatMap((a) => (a.kind === 'block' && a.holds > 0 ? [`${a.holds}턴 유지`] : []))
      const badges = [...holds, ...(def.kind === 'verbIntransitive' ? ['자동사'] : [])]
      // 이월은 배지로 보이므로 사실 문구에서는 뺀다.
      const plainFacts = facts.map((f) => (f.kind === 'block' ? { ...f, text: f.text.replace(/ · \d+턴 유지$/, '') } : f))
      return { facts: plainFacts, tone: effect.range === 'attack' ? 'attack' : 'support', badges }
    }
    case 'adjective': {
      const before = originalEffect.type === 'adjective' ? originalEffect.mods : []
      const facts = effect.mods.map((mod, i) => {
        const baseMod = before[i]
        return fact(ADJECTIVE_KIND[mod.kind], modValue(mod), baseMod ? modValue(baseMod) : null, null, (num) => describeAdjective(mod, num))
      })
      return { facts, tone: 'modifier', badges: [LASTS_TEXT[effect.lasts]] }
    }
    case 'adverb': {
      const before = originalEffect.type === 'adverb' ? originalEffect.mods : []
      const facts = effect.mods.map((mod, i) => {
        const baseMod = before[i]
        return fact(ADVERB_KIND[mod.kind], modValue(mod), baseMod ? modValue(baseMod) : null, null, (num) => describeAdverb(mod, num))
      })
      return { facts, tone: 'modifier', badges: [] }
    }
    case 'target': {
      const kind: FactKind = effect.ref.kind === 'token' ? 'summon' : 'target'
      return { facts: [{ kind, text: describeWord(def), value: null, base: null, to: null }], tone: 'target', badges: [] }
    }
    case 'connective':
      return { facts: [{ kind: 'connective', text: describeWord(def), value: null, base: null, to: null }], tone: 'other', badges: [] }
    case 'junk':
      return { facts: [{ kind: 'junk', text: describeWord(def), value: null, base: null, to: null }], tone: 'other', badges: [] }
  }
}

/** 강화를 반영한 카드 설명 한 줄(강화로 바뀐 수치는 '기본→지금'). 배지(지속·이월·자동사)를 뒤에 붙인다. */
export function cardSummary(wordId: WordId, build: BuildState): string {
  const { facts, badges } = cardFacts(wordId, build)
  return [facts.map((f) => f.text).join(', '), ...badges].filter((t) => t.length > 0).join(' · ')
}
