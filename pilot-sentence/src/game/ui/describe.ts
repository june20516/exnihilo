import type { InterventionStep } from '@/game/content/encounters'
import { TOKENS } from '@/game/content/tokens'
import { getWord, type VerbAction, type WordDef } from '@/game/content/words'
import type { SlotRole } from '@/game/grammar/frames'
import { attachParticle, hasFinalConsonant } from '@/game/grammar/josa'

export const ROLE_NAMES: Record<SlotRole, string> = { subject: '주어', object: '목적어', verb: '동사' }

const RANGE_NAMES = { melee: '근접', ranged: '원거리', support: '지원' } as const

function describeAction(action: VerbAction): string {
  const who = (to: 'subject' | 'object') => ROLE_NAMES[to]
  switch (action.kind) {
    case 'damage':
      return `피해 ${action.amount}`
    case 'block':
      return `${who(action.to)}에게 보호 ${action.amount}`
    case 'heal':
      return `${who(action.to)} 회복 ${action.amount}`
    case 'freeze':
      return `${attachParticle(who(action.to), 'subject')} 다음 행동을 못 한다`
  }
}

/** 손패 타일 하단에 표시할 한 줄 설명. */
export function describeWord(def: WordDef): string {
  const effect = def.effect
  switch (effect.type) {
    case 'junk':
      return '사용할 수 없다'
    case 'target':
      switch (effect.ref.kind) {
        case 'player':
          return '나 자신을 가리킨다'
        case 'chosenEnemy':
          return '적 하나를 가리킨다'
        case 'enemyDef':
          return '적을 가리킨다'
        case 'token': {
          const token = TOKENS[effect.ref.tokenId]
          return `${token.name}(HP ${token.hp})를 불러낸다`
        }
      }
      break
    case 'verb': {
      const text = effect.actions.map(describeAction).join(', ')
      if (def.kind === 'verbIntransitive') return `${text} (자동사)`
      return effect.range === 'melee' || effect.range === 'ranged' ? `${text} (${RANGE_NAMES[effect.range]})` : text
    }
    case 'adjective':
      return effect.mods
        .map((mod) => (mod.kind === 'outgoingDamageMul' ? `주는 피해 ×${mod.value}` : `피해를 주면 독 ${mod.amount}`))
        .join(', ')
    case 'adverb':
      return effect.mods.map((mod) => `동사 위력 ×${mod.value}`).join(', ')
  }
  return ''
}

function withRo(word: string): string {
  const last = word.at(-1) ?? ''
  const endsWithRieul = hasFinalConsonant(last) && (last.charCodeAt(0) - 0xac00) % 28 === 8
  return word + (hasFinalConsonant(word) && !endsWithRieul ? '으로' : '로')
}

/** 적 개입 예고 배지 문구. */
export function describeIntent(step: InterventionStep, roleName: (role: SlotRole) => string): string {
  switch (step.kind) {
    case 'revert':
      return `↺ ${attachParticle(roleName(step.at.role), 'object')} 원문으로 되돌림`
    case 'attach': {
      const text = getWord(step.word).text
      return `＋ ${roleName(step.at.role)}에 [${text}]${attachParticle(text, 'object').slice(text.length)} 붙임`
    }
    case 'replace': {
      const text = getWord(step.word).text
      return `✎ ${attachParticle(roleName(step.at.role), 'object')} [${text}]${withRo(text).slice(text.length)} 교체`
    }
    case 'seal':
      return `🔒 ${attachParticle(roleName(step.at.role), 'object')} 봉인`
    case 'pollute':
      return `☠ 덱에 [${getWord(step.word).text}] ${step.count}장`
  }
}
