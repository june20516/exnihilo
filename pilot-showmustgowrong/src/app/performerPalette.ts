import type { PerformerDef } from '@/content/types'

/** 출연자 id → 색과 id → 짧은 이름. 추세 범례, 정산 연쇄 점, 사고 로그 색 띠가 같은 표를 쓴다 */
export interface PerformerPalette {
  colors: Record<string, string>
  names: Record<string, string>
}

export function performerPalette(performers: Iterable<PerformerDef>): PerformerPalette {
  const colors: Record<string, string> = {}
  const names: Record<string, string> = {}
  for (const performer of performers) {
    colors[performer.id] = performer.color
    names[performer.id] = performer.shortName
  }
  return { colors, names }
}
