import { AUTO_MIN_HOLD_BODY_SECONDS, AUTO_SHOT_BODY_SECONDS, STEP_SECONDS } from '@/content/balance'
import type { ShowDef } from '@/content/types'
import type { BroadcastInput, BroadcastView, RecentPhenomenon } from './engineTypes'

/** 자동 PD의 시간 기준. 둘 다 스텝 수다. */
export interface AutoDirectorTiming {
  /** 평소 한 컷을 잡는 스텝 수 */
  shotSteps: number
  /** 다른 출연자의 사고로 컷을 옮기기 전에 지금 컷을 잡는 최소 스텝 수 */
  minHoldSteps: number
}

function secondsToSteps(seconds: number): number {
  return Math.max(1, Math.round(seconds / STEP_SECONDS))
}

/**
 * 방송을 끝까지 돌리는 쪽(sim)이 decide를 부르는 간격: 6스텝 = 몸 0.1초. 매 스텝 view()를 만들면 방송 한 판이
 * 고정 와이드의 약 2배 걸린다. 시간은 view.step 차이로 재고 최소 유지가 몸 1.5초라 0.1초 늦게 보는 영향은 작다
 * (시드 50 비교에서 게이트 결과가 같고 차이는 시드 1~2개).
 */
export const AUTO_DIRECTOR_INTERVAL_STEPS = secondsToSteps(0.1)

const DEFAULT_TIMING: AutoDirectorTiming = {
  shotSteps: secondsToSteps(AUTO_SHOT_BODY_SECONDS),
  minHoldSteps: secondsToSteps(AUTO_MIN_HOLD_BODY_SECONDS),
}

/** 지금 잡고 있는 컷. targetId는 추적 카메라의 대상이고, 추적 카메라가 아니면 null이다. */
interface Cut {
  cameraId: string
  targetId: string | null
  /** 이 컷을 잡기 시작한(또는 사고로 시간을 다시 센) 스텝 */
  sinceStep: number
}

/** 사고 하나가 가리키는 컷 */
interface IncidentTarget {
  cameraId: string
  targetId: string | null
}

/**
 * 손대지 않을 때 카메라를 알아서 돌리는 자동 PD. 엔진 밖에서 플레이어와 같은 입력(switch, track)만 낸다.
 * 시간은 호출 횟수가 아니라 view.step 차이로 재므로 몇 스텝마다 불러도 같은 컷 길이를 낸다. 난수는 쓰지 않는다.
 */
export class AutoDirector {
  private readonly trackingCameraIds: ReadonlySet<string>
  private readonly seenPhenomenonIds = new Set<number>()
  private cut: Cut | null = null
  /** 평소 순서에서 지금(또는 사고 전) 있던 칸 */
  private rotationIndex = 0
  /** 다음 클로즈업 차례에 잡을 출연자의 performerOrder 위치 */
  private performerCursor = 0
  /** 최소 유지 시간 때문에 아직 옮기지 못한 가장 새 사고 */
  private pendingIncident: IncidentTarget | null = null

  private readonly show: ShowDef
  private readonly performerOrder: readonly string[]
  private readonly timing: AutoDirectorTiming

  /** performerOrder: 무대 출연자 순서(클로즈업 차례 순서) */
  constructor(show: ShowDef, performerOrder: readonly string[], timing: AutoDirectorTiming = DEFAULT_TIMING) {
    this.show = show
    this.performerOrder = performerOrder
    this.timing = timing
    this.trackingCameraIds = new Set(
      show.cameras.filter((camera) => camera.tracking === true).map((camera) => camera.id),
    )
  }

  /** 매 스텝 부른다. 낼 입력이 없으면 빈 배열 */
  decide(view: BroadcastView): BroadcastInput[] {
    if (view.phase !== 'live') {
      // 광고 중에 난 현상도 본 것으로 친다. 광고 뒤에 남은 낡은 사고에 반응하지 않게 한다
      for (const phenomenon of view.recentPhenomena) this.seenPhenomenonIds.add(phenomenon.id)
      return []
    }
    const activeIds = new Set(view.actors.filter((actor) => !actor.walkedOut).map((actor) => actor.id))

    if (this.cut === null) {
      // 처음 부를 때: 이미 있던 현상은 지난 일이고, 컷은 순서의 첫 칸으로 시작한다
      for (const phenomenon of view.recentPhenomena) this.seenPhenomenonIds.add(phenomenon.id)
      this.rotationIndex = 0
      return this.startRotationCut(view, activeIds, 0)
    }

    const incident = this.newestIncident(view, activeIds)
    if (incident !== null) this.pendingIncident = incident
    const pending = this.pendingIncident
    // 기다리는 사이 대상이 이탈했으면 그 사고는 버린다(이탈자를 따라가지 않는다)
    if (pending !== null && pending.targetId !== null && !activeIds.has(pending.targetId)) this.pendingIncident = null
    if (this.pendingIncident !== null) return this.handleIncident(view, this.pendingIncident)

    if (view.step - this.cut.sinceStep >= this.timing.shotSteps) {
      return this.startRotationCut(view, activeIds, this.rotationIndex + 1)
    }
    return []
  }

  /**
   * 아직 보지 못한 현상 가운데 가장 새 사고(강도 1 이상)의 대상 컷. 없으면 null.
   * 방송 정적(silence)은 장비·관객 사고가 아니므로 사고로 치지 않는다(엔진은 recentPhenomena에 싣지 않지만 방어한다).
   */
  private newestIncident(view: BroadcastView, activeIds: ReadonlySet<string>): IncidentTarget | null {
    let newest: RecentPhenomenon | null = null
    for (const phenomenon of view.recentPhenomena) {
      if (this.seenPhenomenonIds.has(phenomenon.id)) continue
      this.seenPhenomenonIds.add(phenomenon.id)
      if (phenomenon.intensity < 1 || phenomenon.kind === 'silence' || phenomenon.sourceId === 'broadcast') continue
      if (newest === null || phenomenon.id > newest.id) newest = phenomenon
    }
    if (newest === null) return null
    const { incidentCamera, fallbackCamera } = this.show.autoCut
    return activeIds.has(newest.sourceId)
      ? { cameraId: incidentCamera, targetId: newest.sourceId }
      : { cameraId: fallbackCamera, targetId: null }
  }

  private handleIncident(view: BroadcastView, target: IncidentTarget): BroadcastInput[] {
    const cut = this.requireCut()
    if (cut.cameraId === target.cameraId && cut.targetId === target.targetId) {
      // 같은 컷에서 또 사고가 났다: 컷은 그대로 두고 잡는 시간을 다시 센다
      this.cut = { ...cut, sinceStep: view.step }
      this.pendingIncident = null
      // 바깥(엔진·플레이어)이 송출이나 대상을 바꿔 두었으면 사고 컷으로 돌려놓는다
      return this.inputsFor(view, cut)
    }
    if (view.step - cut.sinceStep < this.timing.minHoldSteps) return []
    this.pendingIncident = null
    this.cut = { ...target, sinceStep: view.step }
    return this.inputsFor(view, target)
  }

  /** rotation의 fromIndex부터 보내 컷으로 삼을 수 있는 첫 칸으로 옮긴다. 쓸 칸이 없으면 지금 컷을 이어 간다. */
  private startRotationCut(view: BroadcastView, activeIds: ReadonlySet<string>, fromIndex: number): BroadcastInput[] {
    const { rotation } = this.show.autoCut
    for (let offset = 0; offset < rotation.length; offset += 1) {
      const index = (fromIndex + offset) % rotation.length
      const cameraId = rotation[index]
      const targetId = this.trackingCameraIds.has(cameraId) ? this.nextPerformer(activeIds) : null
      if (this.trackingCameraIds.has(cameraId) && targetId === null) continue // 남은 출연자가 없어 건너뛴다
      this.rotationIndex = index
      const target = { cameraId, targetId }
      this.cut = { ...target, sinceStep: view.step }
      return this.inputsFor(view, target)
    }
    // 쓸 칸이 없는 것은 rotation이 추적 카메라뿐이고 활동 출연자가 남지 않았을 때다. 처음 부를 때 그렇다면 잡을 것이 없는
    // 방송이라 requireCut이 오류로 알린다(토크쇼 rotation은 와이드로 시작해 처음 부를 때 늘 칸을 찾는다)
    this.cut = { ...this.requireCut(), sinceStep: view.step }
    return []
  }

  /** performerOrder에서 커서 다음의 활동 출연자를 골라 커서를 넘긴다. 없으면 null */
  private nextPerformer(activeIds: ReadonlySet<string>): string | null {
    const count = this.performerOrder.length
    for (let offset = 0; offset < count; offset += 1) {
      const index = (this.performerCursor + offset) % count
      const id = this.performerOrder[index]
      if (!activeIds.has(id)) continue
      this.performerCursor = (index + 1) % count
      return id
    }
    return null
  }

  /** 추적 카메라는 대상을 먼저 바꾸고(track) 송출을 바꾼다(switch). 이미 그 상태면 입력을 내지 않는다. */
  private inputsFor(view: BroadcastView, target: Pick<Cut, 'cameraId' | 'targetId'>): BroadcastInput[] {
    const inputs: BroadcastInput[] = []
    if (target.targetId !== null && view.cameraTargets[target.cameraId] !== target.targetId) {
      inputs.push({
        type: 'track',
        cameraId: target.cameraId,
        actorId: target.targetId,
      })
    }
    if (view.onAirCameraId !== target.cameraId) inputs.push({ type: 'switch', cameraId: target.cameraId })
    return inputs
  }

  private requireCut(): Cut {
    if (this.cut === null) throw new Error('자동 PD가 컷을 잡기 전에 사고를 처리하려 했습니다')
    return this.cut
  }
}
