import type { BlockChunk } from '@/kit/core/entity'
import { TOKENS } from '@/game/content/tokens'
import { type AdjectiveMod, type AdverbMod, type AppliedStatus, type ConnectiveMode, LASTS_TEXT, type VerbAction, type WordDef } from '@/game/content/words'
import type { SlotRole } from '@/game/grammar/frames'
import { attachParticle } from '@/game/grammar/josa'

export const ROLE_NAMES: Record<SlotRole, string> = { subject: '주어', object: '목적어', verb: '동사' }

const STATUS_NAMES: Record<AppliedStatus, string> = { poison: '독', weak: '약화', vulnerable: '취약', strength: '힘' }

/** 조사 부분만(예: '거미' + object → '를'). */
const particleOf = (word: string, kind: Parameters<typeof attachParticle>[1]) => attachParticle(word, kind).slice(word.length)

function describeAction(action: VerbAction): string {
  const role = (to: 'subject' | 'object') => ROLE_NAMES[to]
  switch (action.kind) {
    case 'damage':
      return action.lifesteal ? `피해 ${action.amount}, 준 만큼 회복` : `피해 ${action.amount}`
    case 'mutualDamage':
      return `서로 피해 ${action.amount}`
    case 'loseHp':
      return `${role(action.to)} HP −${action.amount}`
    case 'block':
      return action.holds > 0 ? `${role(action.to)}에게 보호 ${action.amount} · ${action.holds}턴 유지` : `${role(action.to)}에게 보호 ${action.amount}`
    case 'counter':
      return '주어의 보호만큼 피해, 보호를 모두 씀'
    case 'recall':
      return `망각에서 ${action.amount}장을 서고로`
    case 'heal':
      return `${role(action.to)} 회복 ${action.amount}`
    case 'freeze':
      return `${attachParticle(role(action.to), 'subject')} 다음 행동을 못 한다`
    case 'status': {
      const amount = action.status === 'strength' ? `+${action.amount}` : `${action.amount}`
      return `${role(action.to)}에게 ${STATUS_NAMES[action.status]} ${amount}`
    }
    case 'grow':
      return `${role(action.to)} 최대 HP +${action.amount}`
    case 'cleanse':
      return `${role(action.to)}의 독·약화·빙결 제거`
  }
}

function describeAdjective(mod: AdjectiveMod): string {
  switch (mod.kind) {
    case 'outgoingDamageMul':
      return `주는 피해 ×${mod.value}`
    case 'outgoingFlat':
      return `주는 피해 +${mod.amount}`
    case 'incomingFlat':
      return `받는 피해 −${mod.amount}`
    case 'incomingMul':
      return `받는 피해 ×${mod.value}`
    case 'onHitPoison':
      return `피해를 주면 독 ${mod.amount}`
    case 'selfDamageAfter':
      return `실행 후 자신 HP −${mod.amount}`
  }
}

function describeAdverb(mod: AdverbMod): string {
  switch (mod.kind) {
    case 'powerMul':
      return `동사 위력 ×${mod.value}`
    case 'repeat':
      return `동사를 ${mod.count}번 실행`
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
      const text = effect.actions.map(describeAction).join(', ')
      return def.kind === 'verbIntransitive' ? `${text} (자동사)` : text
    }
    case 'adjective':
      return `${effect.mods.map(describeAdjective).join(', ')} · ${LASTS_TEXT[effect.lasts]}`
    case 'adverb':
      return effect.mods.map(describeAdverb).join(', ')
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
