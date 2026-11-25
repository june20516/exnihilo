import type { EquipmentDef } from '@/content/types'
import type { StudioHit } from '@/render/StudioRenderer'
import type { BroadcastView } from '@/sim/engine'
import { PHENOMENON_LABELS, formatIntensity } from './labels'

/** 호버 설명 내용(spec 8.2 4단계) */
export interface HoverTipContent {
  title: string
  lines: string[]
}

/** 화면에 띄울 호버 설명. x, y는 스튜디오 영역 안의 CSS 좌표다. */
export interface HoverTipState extends HoverTipContent {
  x: number
  y: number
}

/** 마우스 아래 장비나 최근 현상의 설명. 출연자·스태프·빈 곳이면 null. */
export function hoverTipContent(
  hit: StudioHit | null,
  view: Pick<BroadcastView, 'equipment' | 'recentPhenomena'>,
  equipment: readonly EquipmentDef[],
): HoverTipContent | null {
  if (hit?.kind === 'equipment') {
    const def = equipment.find((candidate) => candidate.id === hit.id)
    const state = view.equipment.find((candidate) => candidate.id === hit.id)
    if (def === undefined || state === undefined) return null
    return {
      title: def.name,
      lines: [
        state.released ? '상태: 부서짐' : '상태: 멀쩡함',
        `충격 ${def.breakAt} 이상에 부서짐`,
      ],
    }
  }
  if (hit?.kind === 'phenomenon') {
    const phenomenon = view.recentPhenomena.find((candidate) => candidate.id === hit.id)
    if (phenomenon === undefined) return null
    return {
      title: phenomenon.text,
      lines: [`${PHENOMENON_LABELS[phenomenon.kind]} · ${formatIntensity(phenomenon.intensity)}`],
    }
  }
  return null
}
