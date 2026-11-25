import type { StudioHit } from '@/render/StudioRenderer'
import type { BroadcastSetup, BroadcastView } from '@/sim/engine'
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

/** 현상의 원인·대상 id 가운데 출연자·장비·스태프가 아닌 것의 이름 */
const SPECIAL_SOURCE_NAMES: Record<string, string> = {
  broadcast: '방송',
  audience: '관객석',
}

type HoverSetup = Pick<BroadcastSetup, 'performers' | 'bench' | 'staff' | 'equipment'>

/** 현상의 원인·대상 id를 화면 이름(출연자·스태프는 짧은 이름, 장비는 이름)으로 바꾼다. */
function sourceName(id: string, setup: HoverSetup): string {
  const performer = [...setup.performers, ...setup.bench].find((candidate) => candidate.id === id)
  if (performer !== undefined) return performer.shortName
  const member = setup.staff.find((candidate) => candidate.id === id)
  if (member !== undefined) return member.shortName
  const piece = setup.equipment.find((candidate) => candidate.id === id)
  if (piece !== undefined) return piece.name
  return SPECIAL_SOURCE_NAMES[id] ?? id
}

/** "원인: 렉스" 또는 대상이 있으면 "원인: 렉스 → 대상: 모" */
function causeLine(sourceId: string, targetId: string | null, setup: HoverSetup): string {
  const cause = `원인: ${sourceName(sourceId, setup)}`
  return targetId === null ? cause : `${cause} → 대상: ${sourceName(targetId, setup)}`
}

/** 마우스 아래 장비나 최근 현상의 설명. 출연자·스태프·빈 곳이면 null. */
export function hoverTipContent(
  hit: StudioHit | null,
  view: Pick<BroadcastView, 'equipment' | 'recentPhenomena'>,
  setup: HoverSetup,
): HoverTipContent | null {
  const { equipment } = setup
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
      lines: [
        `${PHENOMENON_LABELS[phenomenon.kind]} · ${formatIntensity(phenomenon.intensity)}`,
        causeLine(phenomenon.sourceId, phenomenon.targetId, setup),
      ],
    }
  }
  return null
}
