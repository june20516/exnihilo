import { type AdjectiveMod, type AdverbMod, getWord, type VerbAction, type WordDef, type WordId } from '@/game/content/words'
import type { SlotRole } from '@/game/grammar/frames'

export type StructureId = 'subjectSlot' | 'objectSlot' | 'verbSlot' | 'handSize' | 'discard'
export type RelicId =
  | 'longSentence' | 'adjectiveChain' | 'stress' | 'ellipsis' | 'scarecrowSpeaker' | 'poisonGrammar' | 'resonance' | 'echo'

/** 런 동안 쌓이는 영구 성장(spec §4). */
export interface BuildState {
  /** 슬롯별 수식어 칸 수. */
  readonly slots: Readonly<Record<SlotRole, number>>
  readonly handMax: number
  readonly discardsPerTurn: number
  /** 단어 종류별 강화 단계. */
  readonly upgrades: Readonly<Record<WordId, 1 | 2>>
  readonly relics: readonly RelicId[]
}

/** 빈 빌드: 기본 랠리와 같은 값. */
export const EMPTY_BUILD: BuildState = {
  slots: { subject: 2, object: 2, verb: 2 },
  handMax: 8,
  discardsPerTurn: 1,
  upgrades: {},
  relics: [],
}

export const MAX_SLOTS = 4

const SLOT_OF: Partial<Record<StructureId, SlotRole>> = { subjectSlot: 'subject', objectSlot: 'object', verbSlot: 'verb' }

export function applyStructure(build: BuildState, id: StructureId): BuildState {
  const role = SLOT_OF[id]
  if (role) return { ...build, slots: { ...build.slots, [role]: Math.min(MAX_SLOTS, build.slots[role] + 1) } }
  if (id === 'handSize') return { ...build, handMax: build.handMax + 1 }
  return { ...build, discardsPerTurn: build.discardsPerTurn + 1 }
}

/** 동사 수치: 단계마다 ×1.5, 각 단계에서 반올림. */
function upgradeAmount(amount: number, level: number): number {
  let value = amount
  for (let i = 0; i < level; i++) value = Math.round(value * 1.5)
  return value
}

/** 배율은 단계마다 +0.5(1보다 작은 약화 배율은 그대로), 가산 +3, 독 +1. */
function upgradeMod<M extends AdjectiveMod | AdverbMod>(mod: M, level: number): M {
  switch (mod.kind) {
    case 'powerMul':
    case 'outgoingDamageMul':
    case 'incomingMul':
      return mod.value < 1 ? mod : { ...mod, value: mod.value + 0.5 * level }
    case 'outgoingFlat':
      return { ...mod, amount: mod.amount + 3 * level }
    case 'onHitPoison':
      return { ...mod, amount: mod.amount + level }
    default:
      return mod
  }
}

function upgradeAction(action: VerbAction, level: number): VerbAction {
  return 'amount' in action ? { ...action, amount: upgradeAmount(action.amount, level) } : action
}

/** 강화 단계를 반영한 단어 정의. 강화하지 않은 단어는 원래 정의 객체를 그대로 돌려준다. */
export function effectiveWord(wordId: WordId, build: BuildState): WordDef {
  const def = getWord(wordId)
  const level = build.upgrades[wordId]
  if (!level) return def
  const effect = def.effect
  switch (effect.type) {
    case 'verb':
      return { ...def, effect: { ...effect, actions: effect.actions.map((a) => upgradeAction(a, level)) } }
    case 'adjective':
      return { ...def, effect: { ...effect, mods: effect.mods.map((m) => upgradeMod(m, level)) } }
    case 'adverb':
      return { ...def, effect: { ...effect, mods: effect.mods.map((m) => upgradeMod(m, level)) } }
    default:
      return def
  }
}

export function wordLookup(build: BuildState): (id: WordId) => WordDef {
  return (id) => effectiveWord(id, build)
}
