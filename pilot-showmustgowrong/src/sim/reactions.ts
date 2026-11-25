import { REACTION_COOLDOWN_SECONDS, STEP_SECONDS } from '@/content/balance'
import type { ActionDef, ReactionDef, Trigger } from '@/content/types'
import { nextFloat, type RngState } from '@/kit/rng'
import { perceives, targetsSelf, type PhenomenonEvent } from './phenomena'

const COOLDOWN_STEPS = Math.round(REACTION_COOLDOWN_SECONDS / STEP_SECONDS)

export interface ReactorView {
  id: string
  x: number
  y: number
  z: number
  inDarkness: boolean
  reactions: ReactionDef[]
  walkedOut: boolean
}

export interface PlannedAction {
  actorId: string
  action: ActionDef
  cause: PhenomenonEvent | null
  /** 사고 로그용 한국어 원인 */
  reason: string
}

export class CooldownTable {
  private readonly lastStep = new Map<string, number>()

  ready(actorId: string, key: string, step: number): boolean {
    const last = this.lastStep.get(`${actorId}|${key}`)
    return last === undefined || step - last >= COOLDOWN_STEPS
  }

  mark(actorId: string, key: string, step: number): void {
    this.lastStep.set(`${actorId}|${key}`, step)
  }

  clear(): void {
    this.lastStep.clear()
  }
}

type EventTrigger = Extract<Trigger, { scope: 'perceived' | 'targetsSelf' }>

function isEventTrigger(trigger: Trigger): trigger is EventTrigger {
  return trigger.kind !== 'gaze' && trigger.kind !== 'corner'
}

/**
 * 쿨다운은 같은 요소가 같은 현상에 반응하는 데 걸리므로 key는 현상 종류 하나다(scope 무관).
 * 시선은 '화면에 잡힘'과 '오래 화면 밖'이 서로 다른 사건이라 따로 센다(분노 직후에도 잡히면 풀 수 있게).
 */
export function cooldownKey(trigger: Trigger): string {
  return trigger.kind === 'gaze' ? `gaze:${trigger.when}` : trigger.kind
}

interface Candidate {
  reaction: ReactionDef
  reactionIndex: number
  trigger: EventTrigger
  event: PhenomenonEvent
}

function matches(trigger: EventTrigger, event: PhenomenonEvent, reactor: ReactorView): boolean {
  if (trigger.kind !== event.kind || event.intensity < trigger.min) return false
  if (!perceives(event, reactor)) return false
  return trigger.scope === 'perceived' || targetsSelf(event, reactor.id)
}

/** 강도가 큰 쪽, 같으면 먼저 정의된 반응, 그것도 같으면 id가 작은 이벤트. */
function isBetter(candidate: Candidate, best: Candidate): boolean {
  if (candidate.event.intensity !== best.event.intensity) {
    return candidate.event.intensity > best.event.intensity
  }
  if (candidate.reactionIndex !== best.reactionIndex) {
    return candidate.reactionIndex < best.reactionIndex
  }
  return candidate.event.id < best.event.id
}

function pickCandidate(
  events: PhenomenonEvent[],
  reactor: ReactorView,
  cooldowns: CooldownTable,
  step: number,
): Candidate | null {
  let best: Candidate | null = null
  reactor.reactions.forEach((reaction, reactionIndex) => {
    const { trigger } = reaction
    if (!isEventTrigger(trigger)) return
    if (!cooldowns.ready(reactor.id, cooldownKey(trigger), step)) return
    for (const event of events) {
      if (!matches(trigger, event, reactor)) continue
      const candidate: Candidate = { reaction, reactionIndex, trigger, event }
      if (best === null || isBetter(candidate, best)) best = candidate
    }
  })
  return best
}

/**
 * 이번에 생긴 이벤트들을 보고 누가 어떤 반응을 할지 계획한다.
 * gaze와 corner 트리거는 엔진이 직접 처리하므로 여기서는 무시한다.
 */
export function resolveReactions(
  events: PhenomenonEvent[],
  reactors: ReactorView[],
  cooldowns: CooldownTable,
  step: number,
  rng: RngState,
  describe: (event: PhenomenonEvent) => string,
): [PlannedAction[], RngState] {
  const planned: PlannedAction[] = []
  let currentRng = rng

  for (const reactor of reactors) {
    if (reactor.walkedOut) continue
    const picked = pickCandidate(events, reactor, cooldowns, step)
    if (picked === null) continue

    const { chance } = picked.reaction
    if (chance !== undefined) {
      const [roll, nextRng] = nextFloat(currentRng)
      currentRng = nextRng
      if (roll >= chance) continue
    }

    cooldowns.mark(reactor.id, cooldownKey(picked.trigger), step)
    planned.push({
      actorId: reactor.id,
      action: picked.reaction.action,
      cause: picked.event,
      reason: describe(picked.event),
    })
  }

  return [planned, currentRng]
}
