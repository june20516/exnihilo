import type { Entity, StatusKind } from '@/kit/core/entity'
import type { CombatEvent, FizzleReason } from '@/game/combat/events'

export interface PreviewLine {
  readonly text: string
  /** harm: 내게 불리 / help: 내게 유리 / neutral */
  readonly tone: 'harm' | 'help' | 'neutral'
}

const STATUS_LABELS: Record<StatusKind, string> = {
  block: '보호',
  poison: '독',
  freeze: '빙결',
  strength: '힘',
  weak: '약화',
  vulnerable: '취약',
}
const BAD_STATUSES: readonly StatusKind[] = ['poison', 'freeze', 'weak', 'vulnerable']
const FIZZLE_LABELS: Record<FizzleReason, string> = { noSubject: '주어가 없음', noObject: '목적어가 없음', frozen: '주어가 잠듦' }

/** 해당 개체에게 나쁜 일이 생기면 아군 기준으로 harm, 적이면 help. */
function toneFor(entity: Entity | undefined, badForTarget: boolean): PreviewLine['tone'] {
  if (!entity) return 'neutral'
  const ally = entity.side === 'ally'
  return badForTarget === ally ? 'harm' : 'help'
}

function describeEvent(event: CombatEvent, entities: readonly Entity[]): PreviewLine | null {
  const find = (id: string) => entities.find((e) => e.id === id)
  const name = (id: string) => find(id)?.name ?? id
  switch (event.type) {
    case 'damaged': {
      const blocked = event.blocked > 0 ? ` (막음 ${event.blocked})` : ''
      return { text: `${name(event.sourceId)} → ${name(event.entityId)}: 피해 ${event.amount}${blocked}`, tone: toneFor(find(event.entityId), true) }
    }
    case 'healed':
      return { text: `${name(event.entityId)}: 회복 +${event.amount}`, tone: toneFor(find(event.entityId), false) }
    case 'statusApplied':
      return {
        text: `${name(event.entityId)}: ${STATUS_LABELS[event.status]} +${event.amount}`,
        tone: toneFor(find(event.entityId), BAD_STATUSES.includes(event.status)),
      }
    case 'hpLost':
      return { text: `${name(event.entityId)}: HP −${event.amount}`, tone: toneFor(find(event.entityId), true) }
    case 'grew':
      return { text: `${name(event.entityId)}: 최대 HP +${event.amount}`, tone: toneFor(find(event.entityId), false) }
    case 'cleansed':
      return { text: `${name(event.entityId)}: 해로운 상태 제거`, tone: toneFor(find(event.entityId), false) }
    case 'summoned':
      return { text: `${name(event.entityId)} 등장`, tone: 'help' }
    case 'died':
      return { text: `${name(event.entityId)} 쓰러짐`, tone: toneFor(find(event.entityId), true) }
    case 'fizzled':
      return { text: `불발: ${FIZZLE_LABELS[event.reason]}`, tone: 'neutral' }
    default:
      return null
  }
}

/** 실행 이벤트를 미리보기 문장으로 바꾼다. */
export function linesFromEvents(events: readonly CombatEvent[], entities: readonly Entity[]): PreviewLine[] {
  return events.map((event) => describeEvent(event, entities)).filter((line): line is PreviewLine => line !== null)
}
