import type { ActionDef, EmotionId, HabitDef, MoveDef } from '@/content/types'
import type { Cast, CastMember } from './cast'
import { entityName } from './describe'
import type { LogKind } from './engineTypes'
import type { HabitTargetResolved, LifeOutput, StudioLife } from './life'
import { burstLine, eventNoun, habitLine, stageLine } from './narration'
import type { EventLog, PhenomenonEvent } from './phenomena'
import { NO_TARGET, type Emitter, type StageLocator, type Target } from './targeting'
import type { Vec3 } from './vec'

/** 로그 한 줄을 남길 때 넘기는 값 */
export interface LineInput {
  text: string
  kind: LogKind
  depth: number
  eventId: number | null
  position: Vec3
  emotion?: EmotionId | null
  /** 이어받은 사고 줄의 앞머리. text가 이것으로 시작한다. 기본 null */
  leadIn?: string | null
}

/** silent면 행동 줄과 현상 줄을 남기지 않는다(버릇·터짐이 자기 줄을 따로 남긴다, L3) */
export interface ActionOptions {
  silent?: boolean
  /** 주면 이 행동이 남기는 첫 사고 줄 앞에 붙인다 */
  linePrefix?: string
}

/** 행동을 실행한 결과: 내뿜은 현상과 이동 대상(이동이 없거나 home이면 대상 없음) */
export interface ActionResult {
  events: PhenomenonEvent[]
  moveTarget: Target
}

/** LifeActions가 엔진에서 빌려 쓰는 것. 물리·점수·난수는 엔진이 맡고 여기서는 부르기만 한다 */
// 실제로 부르는 메서드만 받는다. 테스트가 확률(터짐 판정) 없이 출력을 직접 넣어 줄 규칙을 확인할 수 있다.
export interface LifeActionDeps {
  cast: Pick<Cast, 'get' | 'position'>
  locator: Pick<StageLocator, 'targetById' | 'resolveTarget'>
  log: Pick<EventLog, 'linkedCauseDepth'>
  life: Pick<StudioLife, 'recentHabit'>
  /** 출연자·스태프·장비·카메라의 로그 이름 */
  names: Record<string, string>
  currentStep: () => number
  emit: (partial: Omit<PhenomenonEvent, 'id' | 'depth' | 'step'>) => PhenomenonEvent
  addLine: (line: LineInput) => void
  move: (
    member: CastMember,
    emitter: Emitter,
    move: MoveDef,
    cause: PhenomenonEvent | null,
  ) => Target
  setMotionCause: (member: CastMember, cause: PhenomenonEvent | null) => void
  executeAction: (
    member: CastMember,
    action: ActionDef,
    cause: PhenomenonEvent | null,
    options: ActionOptions,
  ) => ActionResult
}

type HabitOutput = Extract<LifeOutput, { type: 'habit' }>
type BurstOutput = Extract<LifeOutput, { type: 'burst' }>

/**
 * StudioLife의 출력(단계 진입, 버릇, 터짐)을 무대에서 실행하고 로그 줄을 남긴다.
 * 판정은 StudioLife, 문장은 narration이 맡고 여기서는 실행과 줄만 다룬다.
 */
export class LifeActions {
  private readonly deps: LifeActionDeps

  constructor(deps: LifeActionDeps) {
    this.deps = deps
  }

  execute(output: LifeOutput): void {
    const member = this.deps.cast.get(output.actorId)
    // StudioLife는 활동 출연자에게만 출력하지만, 같은 틱 안의 변화에도 어긋나지 않게 확인한다.
    if (member === undefined || member.walkedOut) return
    switch (output.type) {
      case 'stage':
        this.deps.addLine({
          text: stageLine(
            member.def.shortName,
            this.recentHabit(member),
            output.emotion,
            output.stage,
          ),
          kind: 'stage',
          depth: 1,
          eventId: null,
          position: this.deps.cast.position(member),
          emotion: output.emotion.id,
        })
        return
      case 'habit':
        this.performHabit(member, output)
        return
      case 'burst':
        this.performBurst(member, output)
        return
    }
  }

  /** 버릇: 포즈, 이동, 기척(강도 0)을 하고 버릇 줄 하나만 남긴다. 줄은 기척의 id를 가진다(L3). */
  private performHabit(member: CastMember, output: HabitOutput): void {
    const { cast } = this.deps
    const { habit, cause } = output
    member.pose = habit.pose
    member.poseStep = this.deps.currentStep()
    const emitter: Emitter = { id: member.def.id, position: cast.position(member) }
    if (habit.move !== undefined) this.deps.move(member, emitter, habit.move, cause)
    const target = this.habitTarget(output.target, emitter, cause)
    const stir =
      habit.stir === undefined
        ? null
        : this.deps.emit({
            kind: habit.stir.kind,
            intensity: 0,
            sourceId: member.def.id,
            targetId: target.id,
            ...emitter.position,
            causeId: cause?.id ?? null,
            label: habit.noun,
          })
    // 버릇으로 움직이다 부딪히면 그 충돌은 버릇에서 이어진다.
    if (habit.move !== undefined) this.deps.setMotionCause(member, stir ?? cause)
    this.deps.addLine({
      text: habitLine(
        member.def.shortName,
        habit,
        this.performerName(target.id, member.def.id),
        this.receivedFrom(cause),
      ),
      kind: 'habit',
      // 기척이 없으면 기척을 냈을 때와 같은 깊이(원인 깊이, 광고 전 원인이면 0)
      depth: stir?.depth ?? this.deps.log.linkedCauseDepth(cause?.id ?? null),
      eventId: stir?.id ?? null,
      position: emitter.position,
    })
  }

  /** 터짐: 행동을 묵음으로 실행하고 터짐 줄 하나만 남긴다. 줄은 첫 사건의 id를 가진다(L3). */
  private performBurst(member: CastMember, output: BurstOutput): void {
    const { burst, cause, emotion } = output
    const position = this.deps.cast.position(member)
    // 사건이 없을 때의 깊이는 행동 전(광고 경계 포함)에 정한다.
    const causeDepth = this.deps.log.linkedCauseDepth(cause?.id ?? null)
    const { events, moveTarget } = this.deps.executeAction(member, burst.action, cause, {
      silent: true,
    })
    const [first] = events
    const targetName =
      this.performerName(first?.targetId ?? null, member.def.id) ??
      this.performerName(moveTarget.id, member.def.id)
    this.deps.addLine({
      text: burstLine(
        member.def.shortName,
        this.recentHabit(member),
        emotion,
        burst,
        targetName,
        output.intense,
        output.top,
        (id) => entityName(id, this.deps.names),
      ),
      kind: 'incident',
      depth: first?.depth ?? causeDepth + 1,
      eventId: first?.id ?? null,
      position,
      emotion: emotion.id,
    })
  }

  private recentHabit(member: CastMember): HabitDef | null {
    return this.deps.life.recentHabit(member.def.id, this.deps.currentStep())
  }

  /** StudioLife가 푼 대상을 무대 위 대상으로. 이탈했거나 무대에 없는 출연자는 대상 없음이다. */
  private habitTarget(
    target: HabitTargetResolved,
    emitter: Emitter,
    cause: PhenomenonEvent | null,
  ): Target {
    const { locator } = this.deps
    if (target === null) return NO_TARGET
    if (target.kind === 'actor') return locator.targetById(target.id)
    return locator.resolveTarget(target.selector, emitter, cause)
  }

  /** 줄에 쓸 대상 출연자 이름. 출연자가 아니거나, 자기 자신이거나, 이탈했으면 null이다. */
  private performerName(id: string | null, selfId: string): string | null {
    if (id === null || id === selfId) return null
    const member = this.deps.cast.get(id)
    if (member === undefined || member.walkedOut) return null
    return member.def.shortName
  }

  /** 응답 버릇이 받은 현상(누구의 무엇). 원인이 없거나 출연자가 낸 것이 아니면 null이다. */
  private receivedFrom(cause: PhenomenonEvent | null): { sourceName: string; noun: string } | null {
    if (cause === null) return null
    const source = this.deps.cast.get(cause.sourceId)
    if (source === undefined) return null
    return { sourceName: source.def.shortName, noun: eventNoun(cause) }
  }
}
