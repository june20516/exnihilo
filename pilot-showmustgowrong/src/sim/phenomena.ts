import { NOISE_RADIUS, SIGHT_RADIUS } from '@/content/balance'
import type { Intensity, PhenomenonKind } from '@/content/types'

export interface PhenomenonEvent {
  id: number
  kind: PhenomenonKind
  intensity: Intensity
  /** actor, 장비 id, 또는 'broadcast'(정적), 'audience' */
  sourceId: string
  targetId: string | null
  x: number
  y: number
  step: number
  causeId: number | null
  depth: number
}

export interface Perceiver {
  id: string
  x: number
  y: number
  inDarkness: boolean
}

function distanceBetween(event: PhenomenonEvent, perceiver: Perceiver): number {
  return Math.hypot(event.x - perceiver.x, event.y - perceiver.y)
}

export function targetsSelf(event: PhenomenonEvent, perceiverId: string): boolean {
  return event.targetId === perceiverId
}

export function perceives(event: PhenomenonEvent, perceiver: Perceiver): boolean {
  if (event.kind === 'impact') {
    return event.sourceId === perceiver.id || event.targetId === perceiver.id
  }
  if (event.sourceId === perceiver.id) return false

  const distance = distanceBetween(event, perceiver)
  switch (event.kind) {
    case 'noise':
      return distance <= NOISE_RADIUS[event.intensity]
    case 'laughter':
    case 'exposure':
      return distance <= SIGHT_RADIUS && !perceiver.inDarkness
    case 'anger':
      if (event.targetId !== null) return targetsSelf(event, perceiver.id)
      return distance <= SIGHT_RADIUS
    case 'darkness':
      return perceiver.inDarkness
    case 'silence':
      return true
    case 'gaze':
      return false
  }
}

export class EventLog {
  private readonly events: PhenomenonEvent[] = []
  private nextId = 1
  /** 이 id 이하의 이벤트는 depth 계산에서 원인으로 치지 않는다. */
  private chainBreakId = 0

  emit(partial: Omit<PhenomenonEvent, 'id' | 'depth'>): PhenomenonEvent {
    const cause = partial.causeId === null ? undefined : this.get(partial.causeId)
    const depth = cause && cause.id > this.chainBreakId ? cause.depth + 1 : 1
    const event: PhenomenonEvent = { ...partial, id: this.nextId, depth }
    this.nextId += 1
    this.events.push(event)
    return event
  }

  /** 이전 이벤트를 원인으로 한 emit은 depth를 1부터 다시 센다(광고용). causeId는 그대로 기록한다. */
  breakChains(): void {
    this.chainBreakId = this.nextId - 1
  }

  get(id: number): PhenomenonEvent | undefined {
    // 불변식: 이벤트의 id는 배열 index + 1이다.
    if (!Number.isInteger(id) || id < 1 || id > this.events.length) return undefined
    return this.events[id - 1]
  }

  since(step: number): PhenomenonEvent[] {
    return this.events.filter((event) => event.step >= step)
  }

  /** 뿌리부터 자신까지. 원인이 로그에 없으면 거기서 멈춘다. */
  chain(id: number): PhenomenonEvent[] {
    const result: PhenomenonEvent[] = []
    let current = this.get(id)
    while (current) {
      result.unshift(current)
      current = current.causeId === null ? undefined : this.get(current.causeId)
    }
    return result
  }
}
