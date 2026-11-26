import { NOISE_RADIUS, SIGHT_RADIUS, STIR_NOISE_RADIUS, STIR_SIGHT_RADIUS } from '@/content/balance'
import type { EventIntensity, PhenomenonKind, StirKind } from '@/content/types'
import { distance3 } from './vec'

export interface PhenomenonEvent {
  id: number
  kind: PhenomenonKind
  intensity: EventIntensity
  /** actor, 장비 id, 또는 'broadcast'(정적), 'audience' */
  sourceId: string
  targetId: string | null
  x: number
  y: number
  z: number
  step: number
  causeId: number | null
  depth: number
  /** 버릇이 낸 기척의 이름 명사(예: '킥킥거림'). 문구를 만들 때 쓴다. */
  label?: string
}

const STIR_KINDS: readonly StirKind[] = ['noise', 'laughter', 'anger', 'exposure']

export function isStir(event: PhenomenonEvent): boolean {
  return event.intensity === 0
}

export function canBeStir(kind: PhenomenonKind): kind is StirKind {
  return (STIR_KINDS as readonly PhenomenonKind[]).includes(kind)
}

export interface Perceiver {
  id: string
  x: number
  y: number
  z: number
  inDarkness: boolean
}

export function targetsSelf(event: PhenomenonEvent, perceiverId: string): boolean {
  return event.targetId === perceiverId
}

export function perceives(event: PhenomenonEvent, perceiver: Perceiver): boolean {
  if (event.kind === 'impact') {
    return event.sourceId === perceiver.id || event.targetId === perceiver.id
  }
  if (event.sourceId === perceiver.id) return false

  const distance = distance3(event, perceiver)
  const sightRadius = isStir(event) ? STIR_SIGHT_RADIUS : SIGHT_RADIUS
  switch (event.kind) {
    case 'noise':
      return (
        distance <= (event.intensity === 0 ? STIR_NOISE_RADIUS : NOISE_RADIUS[event.intensity])
      )
    case 'laughter':
    case 'exposure':
      return distance <= sightRadius && !perceiver.inDarkness
    case 'anger':
      if (event.targetId !== null) return targetsSelf(event, perceiver.id)
      return distance <= sightRadius
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
  /** 광고가 끊은 지점들(그 시점의 마지막 이벤트 id). 원인 id <= 지점 < 이벤트 id 인 연결은 끊긴 것이다. */
  private readonly breakIds: number[] = []

  /**
   * 강도 1 이상은 원인 깊이 + 1, 기척(강도 0)은 원인 깊이 그대로다.
   * 원인이 없거나 광고 전이면 각각 1, 0이다.
   */
  emit(partial: Omit<PhenomenonEvent, 'id' | 'depth'>): PhenomenonEvent {
    if (partial.intensity === 0 && !canBeStir(partial.kind)) {
      throw new Error(`${partial.kind}은(는) 기척(강도 0)이 될 수 없습니다`)
    }
    const cause = this.linkedCause(partial.causeId, this.nextId)
    const causeDepth = cause?.depth ?? 0
    const depth = partial.intensity === 0 ? causeDepth : causeDepth + 1
    const event: PhenomenonEvent = { ...partial, id: this.nextId, depth }
    this.nextId += 1
    this.events.push(event)
    return event
  }

  /**
   * 지금 새 사건을 낸다면 이을 원인의 깊이. 원인이 없거나 광고로 끊겼으면 0이다.
   * 현상을 내지 않는 줄(기척 없는 버릇, 사건 없는 터짐)도 emit과 같은 깊이 규칙을 따르게 한다.
   */
  linkedCauseDepth(causeId: number | null): number {
    return this.linkedCause(causeId, this.nextId)?.depth ?? 0
  }

  /** 이전 이벤트를 원인으로 한 emit은 depth를 1부터 다시 센다(광고용). causeId는 그대로 기록한다. */
  breakChains(): void {
    this.breakIds.push(this.nextId - 1)
  }

  /** eventId 시점에서 광고에 끊기지 않고 이어지는 원인 이벤트. */
  private linkedCause(causeId: number | null, eventId: number): PhenomenonEvent | undefined {
    if (causeId === null) return undefined
    const cause = this.get(causeId)
    if (cause === undefined) return undefined
    const broken = this.breakIds.some((breakId) => causeId <= breakId && breakId < eventId)
    return broken ? undefined : cause
  }

  /** 원인을 따라 원인 없는 사건까지 거슬러 간 뿌리. 광고로 끊긴 연결은 넘지 않는다. 기척도 거친다. */
  rootOf(id: number): PhenomenonEvent | undefined {
    let current = this.get(id)
    while (current) {
      const cause = this.linkedCause(current.causeId, current.id)
      if (cause === undefined) return current
      current = cause
    }
    return undefined
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
