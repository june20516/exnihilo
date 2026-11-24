import type { IntentAction } from '@/game/rally/summary'
import { ROLE_NAMES } from './describe'

const STATUS_NAMES = { poison: '독', weak: '약화', vulnerable: '취약', strength: '힘' } as const

/** 예고 행동 칩의 문구. 예: '공격 14', '보호 8 · 1턴 유지', '봉인 주어 칸'. */
export function intentActionText(action: IntentAction): string {
  switch (action.kind) {
    case 'attack':
      return `공격 ${action.amount}`
    case 'block':
      return action.holds > 0 ? `보호 ${action.amount} · ${action.holds}턴 유지` : `보호 ${action.amount}`
    case 'seal':
      return action.fizzled ? '봉인 — 빙결로 무효' : `봉인 ${ROLE_NAMES[action.role]} 칸`
    case 'status':
      return `${STATUS_NAMES[action.status]} ${action.amount}`
    case 'grow':
      return `최대 HP +${action.amount}`
    case 'fizzled':
      return '빙결로 무효'
  }
}
