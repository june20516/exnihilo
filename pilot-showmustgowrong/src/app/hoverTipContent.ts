import type { StudioHit } from '@/render/StudioRenderer'
import type { BroadcastSetup, BroadcastView } from '@/sim/engine'
import { PHENOMENON_LABELS, cameraName, formatIntensity } from './labels'

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

/** 호버 설명을 붙인 대상과 그 자리(스튜디오 영역 안의 CSS 좌표). 내용은 매 view마다 다시 구한다. */
export interface HoverAnchor {
  hit: StudioHit
  x: number
  y: number
}

/** 현상의 원인·대상 id 가운데 출연자·장비·스태프가 아닌 것의 이름 */
const SPECIAL_SOURCE_NAMES: Record<string, string> = {
  broadcast: '방송',
  audience: '관객석',
}

type HoverSetup = Pick<BroadcastSetup, 'performers' | 'bench' | 'staff' | 'equipment' | 'show'>
type HoverView = Pick<BroadcastView, 'equipment' | 'recentPhenomena' | 'actors' | 'staff'>

/** 현상의 원인·대상 id를 화면 이름(출연자·스태프는 짧은 이름, 장비는 이름)으로 바꾼다. */
export function sourceName(id: string, setup: HoverSetup): string {
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

/** 스태프의 이름·역할, 성향, 담당 카메라. 정의가 없으면 null. */
function staffContent(id: string, setup: HoverSetup): HoverTipContent | null {
  const member = setup.staff.find((candidate) => candidate.id === id)
  if (member === undefined) return null
  const { cameras } = setup.show
  const camera = cameras.find((candidate) => candidate.id === member.cameraId)
  return {
    title: `${member.name} · ${member.role}`,
    lines: [
      member.tendency,
      `담당 ${camera === undefined ? member.cameraId : cameraName(cameras, camera)}`,
    ],
  }
}

/** 마우스 아래 스태프·장비·최근 현상의 설명. 출연자는 정보 카드(ActorInfoCard)가 맡으므로 null. 빈 곳이면 null. */
export function hoverTipContent(
  hit: StudioHit | null,
  view: HoverView,
  setup: HoverSetup,
): HoverTipContent | null {
  if (hit?.kind === 'staff') return staffContent(hit.id, setup)
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

/**
 * 고정된 자리에 띄울 호버 설명을 지금 view로 다시 만든다. 장비 상태가 바뀌면 내용이 바뀌고,
 * 현상이 사라졌거나 설명할 대상이 아니면 null(설명을 닫는다).
 */
export function resolveHoverTip(
  anchor: HoverAnchor,
  view: HoverView,
  setup: HoverSetup,
): HoverTipState | null {
  const content = hoverTipContent(anchor.hit, view, setup)
  return content === null ? null : { ...content, x: anchor.x, y: anchor.y }
}
