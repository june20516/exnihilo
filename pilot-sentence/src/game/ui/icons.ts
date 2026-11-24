import type { Amplifier, ChangeChipKind, IntentAction } from '@/game/rally/summary'
import type { FactKind } from './describe'

/**
 * 종류별 아이콘(Material Symbols Outlined 이름)과 색. 화면은 여기서만 아이콘을 고른다(표시 spec §2).
 * 단어·유물 id가 아니라 효과 종류로 찾으므로, 같은 종류의 새 콘텐츠는 코드 변경 없이 같은 아이콘을 쓴다.
 */
export type IconKind = FactKind | ChangeChipKind | IntentAction['kind'] | Amplifier['kind'] | 'draw' | 'discardPile'

export const ICONS: Readonly<Record<IconKind, string>> = {
  damage: 'swords', blocked: 'shield', block: 'shield', heal: 'favorite', hpLoss: 'heart_minus', grow: 'add_circle',
  poison: 'skull', weak: 'trending_down', vulnerable: 'heart_broken', strength: 'fitness_center', freeze: 'ac_unit',
  cleanse: 'auto_fix_high', recall: 'history', counter: 'reply', outMul: 'close', outFlat: 'add', inMul: 'close', inFlat: 'remove',
  selfDamage: 'heart_minus', power: 'bolt', repeat: 'repeat', again: 'update', persist: 'lock_clock', target: 'my_location',
  summon: 'person_add', connective: 'link', junk: 'block', emptyDraw: 'menu_book', summoned: 'person_add', attack: 'swords',
  seal: 'lock', status: 'science', fizzled: 'do_not_disturb_on', relic: 'diamond', structure: 'view_week', upgrade: 'upgrade',
  draw: 'menu_book', discardPile: 'history_edu',
}

/** 칩 색(Tailwind 텍스트 색). 해로운 것·이로운 것·중립. */
export const TONES: Readonly<Partial<Record<IconKind, string>>> = {
  damage: 'text-error', attack: 'text-error', hpLoss: 'text-error', selfDamage: 'text-error', emptyDraw: 'text-error', vulnerable: 'text-error',
  poison: 'text-tertiary', weak: 'text-on-surface-variant', freeze: 'text-tertiary',
  block: 'text-tertiary', blocked: 'text-tertiary', heal: 'text-primary', grow: 'text-primary', strength: 'text-secondary',
  power: 'text-secondary', repeat: 'text-secondary', outMul: 'text-secondary', inMul: 'text-secondary', counter: 'text-secondary',
}
