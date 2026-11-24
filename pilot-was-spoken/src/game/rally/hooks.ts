import { relicEffects, type RelicEffect } from '@/game/build/relics'
import { RALLY_RULES } from '@/game/content/balance'
import { type ConnectiveMode, getWord, type WordId } from '@/game/content/words'
import type { ClauseHooks } from '@/game/resolve/resolve'
import { type Board, isSlotActive } from '@/game/sentence/board'
import type { RallyState } from './combat'
import { isBlank, materialize } from './sentence'

/** 효과로 훅을 만들 때 필요한 이 절의 사정. */
export interface HookContext {
  /** 긴 문장이 세는 단어 수(켜진 칸의 내 단어 + 연결어). */
  readonly countedWords: number
  /** 이 절의 주어가 비어 있는가. */
  readonly subjectBlank: boolean
  readonly clause: number
  /** 이번 문장의 절 수. */
  readonly clauseCount: number
}

type MutableHooks = { -readonly [K in keyof ClauseHooks]: ClauseHooks[K] }

/**
 * 유물 효과 목록을 이 절의 훅으로 접는다. 유물 id를 보지 않으므로 같은 종류의 효과는 몇 개든 더해진다.
 * 기본값과 같은 필드는 넣지 않는다.
 */
export function hooksFromEffects(effects: readonly RelicEffect[], context: HookContext): ClauseHooks {
  const hooks: MutableHooks = {}
  let damageBonus = 0
  let supportBonus = 0
  for (const effect of effects) {
    switch (effect.kind) {
      case 'perWordBonus': {
        const bonus = context.countedWords * effect.amount
        damageBonus += bonus
        supportBonus += bonus
        break
      }
      case 'blankSubjectBonus':
        if (context.subjectBlank) damageBonus += effect.amount
        break
      case 'chainBoost':
        hooks.chainBoost = { factor: effect.factor, minAdjectives: effect.minAdjectives }
        break
      case 'adverbTwice':
        hooks.adverbTwice = true
        break
      case 'poisonBonus':
        hooks.poisonBonus = (hooks.poisonBonus ?? 0) + effect.amount
        break
      case 'soloRepeat':
        if (context.clause === 0 && context.clauseCount === 1) hooks.repeatBonus = (hooks.repeatBonus ?? 0) + effect.amount
        break
      case 'impliedSubject':
      case 'returnFirstVerb':
        // 절의 계산 훅이 아니다. impliedSubjectOf·returnsFirstVerb가 다룬다.
        break
    }
  }
  if (damageBonus > 0) hooks.damageBonus = damageBonus
  if (supportBonus > 0) hooks.supportBonus = supportBonus
  return hooks
}

/** 긴 문장이 세는 단어: 실행되는(켜진) 칸에 놓인 내 단어와 연결어 카드. */
export function countedWords(state: RallyState): number {
  const onActiveSlots = state.board.clauses.flatMap((c, clause) =>
    c.slots
      .filter((slot) => isSlotActive(state.board, { clause, role: slot.role }))
      .flatMap((slot) => [slot.head, ...slot.modifiers])
      .filter((w) => w !== null && w.owner === 'player'),
  )
  return onActiveSlots.length + (state.connective ? 1 : 0)
}

/** 낭독할 내 절에 끼어드는 빌드 훅(유물). 미리보기와 계산식도 이 함수를 쓴다. */
export function clauseHooks(state: RallyState, clause: number): ClauseHooks {
  const subject = state.board.clauses[clause]?.slots.find((s) => s.role === 'subject')
  return hooksFromEffects(relicEffects(state.build.relics), {
    countedWords: countedWords(state),
    subjectBlank: subject !== undefined && isBlank(subject.head),
    clause,
    clauseCount: state.board.clauses.length,
  })
}

/** 생략된 주어를 채울 단어(효과 impliedSubject). 없으면 undefined(당신). */
export function impliedSubjectOf(state: RallyState): WordId | undefined {
  const effect = relicEffects(state.build.relics).find((e) => e.kind === 'impliedSubject')
  return effect?.kind === 'impliedSubject' ? effect.word : undefined
}

/** 첫 절의 동사 카드가 손패로 돌아오는가(효과 returnFirstVerb). */
export function returnsFirstVerb(state: RallyState): boolean {
  return relicEffects(state.build.relics).some((e) => e.kind === 'returnFirstVerb')
}

export function connectiveMode(state: RallyState): ConnectiveMode | null {
  const effect = state.connective ? getWord(state.connective.wordId).effect : null
  return effect?.type === 'connective' ? effect.mode : null
}

/** 낭독할 때 빈칸을 채우는 방식(생략된 주어의 토큰, 그러면서). */
export function materializeFor(state: RallyState): Board {
  return materialize(state.board, state.targetId, {
    impliedSubject: impliedSubjectOf(state),
    borrowModifiers: connectiveMode(state) === 'while',
  })
}

/** 그래서: 앞 절에서 적이 받은 피해 합에 비율을 곱해 내림. */
export function soBonusFrom(burst: number): number {
  return Math.floor(burst * RALLY_RULES.soRatio)
}
