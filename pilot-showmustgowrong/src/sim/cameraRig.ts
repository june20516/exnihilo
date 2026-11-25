import { STAFF_RECOVERY, STEP_SECONDS } from '@/content/balance'
import type { CameraDef, PerformerDef, StaffDef } from '@/content/types'
import type { StaffMode, StaffView } from './engineTypes'
import { type FloorPoint, normalizeDegrees, rotateYaw, yawBetween } from './vec'

/** 스태프 지시가 정하는 카메라 방향. default는 지시 방향을 지우고 기준으로 돌아간다. */
export type DirectedAim = { kind: 'default' } | { kind: 'yaw'; yaw: number }

type TrackCandidate = Pick<PerformerDef, 'id' | 'presence' | 'tags'>

interface CameraState {
  readonly def: CameraDef
  /** 추적 대상 출연자 id. 추적 카메라가 아니거나 대상이 없으면 null */
  target: string | null
  /** 마지막 update에서 계산한 대상 방향. 대상 위치를 모르면 null */
  trackYaw: number | null
  /** 스태프 지시로 정한 방향. 있으면 추적과 기본 방향보다 앞선다. */
  directedYaw: number | null
}

interface StaffState {
  readonly def: StaffDef
  readonly holdSteps: number
  readonly totalSteps: number
  /** 놀라서 돌린 방향. 놀라지 않았으면 null */
  panicYaw: number | null
  /** 놀란 뒤 지난 update 수 */
  elapsedSteps: number
}

function secondsToSteps(seconds: number): number {
  return Math.round(seconds / STEP_SECONDS)
}

/**
 * 대상 이탈 뒤 재선택(spec 3.1): 존재감이 가장 높은 출연자, 같으면 먼저 오른 출연자.
 * 후보는 무대에 오른 순서여야 한다. 아무도 없으면 null.
 */
export function choosePresenceTarget(candidates: readonly TrackCandidate[]): string | null {
  let best: TrackCandidate | null = null
  for (const candidate of candidates) {
    if (best === null || candidate.presence > best.presence) best = candidate
  }
  return best?.id ?? null
}

/** 시작 대상(spec 3.1): 첫 코너 startTag를 가진 첫 출연자, 없으면 choosePresenceTarget. */
export function chooseStartTarget(
  candidates: readonly TrackCandidate[],
  startTag: string,
): string | null {
  const tagged = candidates.find((candidate) => candidate.tags.includes(startTag))
  return tagged?.id ?? choosePresenceTarget(candidates)
}

/**
 * 카메라 방향의 단일 출처. 기준 방향(지시 방향 > 추적 대상 > 기본 방향)과
 * 스태프 놀람·자동 복구(spec 5.6)를 합쳐 실제 방향을 낸다. rng는 쓰지 않는다(무작위 방향은 엔진이 준다).
 */
export class CameraRig {
  private readonly cameras = new Map<string, CameraState>()
  private readonly staff = new Map<string, StaffState>()
  /** 카메라 id → 그 카메라를 맡은 스태프 */
  private readonly operators = new Map<string, StaffState>()
  /** 마지막 update에서 복귀를 마친 스태프 id */
  private settled: string[] = []

  constructor(cameras: CameraDef[], staff: StaffDef[]) {
    for (const def of cameras) {
      this.cameras.set(def.id, { def, target: null, trackYaw: null, directedYaw: null })
    }
    for (const def of staff) {
      if (!this.cameras.has(def.cameraId)) {
        throw new Error(`스태프 ${def.id}가 맡은 알 수 없는 카메라입니다: ${def.cameraId}`)
      }
      if (this.operators.has(def.cameraId)) {
        throw new Error(`카메라 ${def.cameraId}는 이미 다른 스태프가 맡고 있습니다: ${def.id}`)
      }
      const recovery = def.recovery ?? STAFF_RECOVERY
      const holdSteps = secondsToSteps(recovery.holdSeconds)
      const returnSteps = secondsToSteps(recovery.returnSeconds)
      // 복귀가 한 스텝도 안 걸리면 복귀 보간(t = 경과/복귀 스텝)이 0으로 나누기가 된다.
      if (holdSteps < 0 || returnSteps < 1) {
        throw new Error(`스태프 ${def.id}의 복구 시간 범위 오류: 유지 ${holdSteps}스텝, 복귀 ${returnSteps}스텝`)
      }
      const state: StaffState = {
        def,
        holdSteps,
        totalSteps: holdSteps + returnSteps,
        panicYaw: null,
        elapsedSteps: 0,
      }
      this.staff.set(def.id, state)
      this.operators.set(def.cameraId, state)
    }
  }

  /** 지금 실제 방향(도, (-180, 180]) */
  angle(cameraId: string): number {
    const camera = this.requireCamera(cameraId)
    const base = this.baseAngle(camera)
    const operator = this.operators.get(cameraId)
    if (operator === undefined || operator.panicYaw === null) return base
    if (operator.elapsedSteps < operator.holdSteps) return operator.panicYaw
    const returnSteps = operator.totalSteps - operator.holdSteps
    const t = (operator.elapsedSteps - operator.holdSteps) / returnSteps
    return rotateYaw(operator.panicYaw, base, t)
  }

  target(cameraId: string): string | null {
    return this.requireCamera(cameraId).target
  }

  /** PD의 대상 바꾸기(track). 스태프 지시 방향을 지우고 대상 추적으로 돌아간다(R7). */
  setTarget(cameraId: string, actorId: string | null): void {
    const camera = this.requireCamera(cameraId)
    if (camera.def.tracking !== true) throw new Error(`추적 카메라가 아닙니다: ${cameraId}`)
    camera.target = actorId
    camera.directedYaw = null
  }

  /** 카메라별 실제 방향 */
  angles(): Record<string, number> {
    return Object.fromEntries([...this.cameras.keys()].map((id) => [id, this.angle(id)]))
  }

  /** 카메라별 추적 대상. 추적 카메라가 아니면 null */
  targets(): Record<string, string | null> {
    return Object.fromEntries([...this.cameras.keys()].map((id) => [id, this.target(id)]))
  }

  /** 방송 시작 때 추적 카메라마다 시작 대상을 정한다(chooseStartTarget). */
  startTracking(candidates: readonly TrackCandidate[], startTag: string): void {
    for (const camera of this.trackingCameras()) {
      camera.target = chooseStartTarget(candidates, startTag)
    }
  }

  /**
   * 대상이 없거나 active(무대에 오른 순서의 이탈하지 않은 출연자)에 없는 추적 카메라는
   * 존재감 규칙(choosePresenceTarget)으로만 다시 고른다. 코너 startTag는 다시 쓰지 않는다(R11).
   */
  retarget(active: readonly TrackCandidate[]): void {
    for (const camera of this.trackingCameras()) {
      if (active.some((candidate) => candidate.id === camera.target)) continue
      camera.target = choosePresenceTarget(active)
    }
  }

  /** 광고 reset: 모든 스태프의 놀람을 끝내 평상시로 되돌린다(R12). 지시 방향은 그대로 둔다. */
  calmAllStaff(): void {
    for (const member of this.staff.values()) {
      member.panicYaw = null
      member.elapsedSteps = 0
    }
  }

  /** 놀람 시작 또는 재시작. 유지·복귀 타이머가 처음부터 다시 돈다. */
  panic(staffId: string, randomYaw: number): void {
    const member = this.requireStaff(staffId)
    member.panicYaw = normalizeDegrees(randomYaw)
    member.elapsedSteps = 0
  }

  /** 지시는 즉시 반영하고 놀람을 끝낸다. */
  direct(staffId: string, aim: DirectedAim): void {
    const member = this.requireStaff(staffId)
    const camera = this.requireCamera(member.def.cameraId)
    camera.directedYaw = aim.kind === 'yaw' ? normalizeDegrees(aim.yaw) : null
    member.panicYaw = null
    member.elapsedSteps = 0
  }

  /** 매 스텝 한 번. 추적 대상 방향을 다시 계산하고 놀람 타이머를 진행한다. */
  update(positionOf: (actorId: string) => FloorPoint | null): void {
    for (const camera of this.cameras.values()) {
      const position = camera.target === null ? null : positionOf(camera.target)
      camera.trackYaw = position === null ? null : yawBetween(camera.def.position, position)
    }
    this.settled = []
    for (const member of this.staff.values()) {
      if (member.panicYaw === null) continue
      member.elapsedSteps += 1
      if (member.elapsedSteps >= member.totalSteps) {
        member.panicYaw = null
        member.elapsedSteps = 0
        this.settled.push(member.def.id)
      }
    }
  }

  /** 마지막 update에서 복귀를 마친 스태프 id. 지시로 끝난 놀람은 들지 않는다. */
  settledStaffIds(): string[] {
    return [...this.settled]
  }

  staffViews(): Omit<StaffView, 'name' | 'misfireChance' | 'x' | 'y' | 'z'>[] {
    return [...this.staff.values()].map((member) => ({
      id: member.def.id,
      cameraId: member.def.cameraId,
      mode: this.modeOf(member),
      recoveryProgress:
        member.panicYaw === null ? 1 : member.elapsedSteps / member.totalSteps,
    }))
  }

  private modeOf(member: StaffState): StaffMode {
    if (member.panicYaw === null) return 'normal'
    return member.elapsedSteps < member.holdSteps ? 'startled' : 'recovering'
  }

  private trackingCameras(): CameraState[] {
    return [...this.cameras.values()].filter((camera) => camera.def.tracking === true)
  }

  private baseAngle(camera: CameraState): number {
    if (camera.directedYaw !== null) return camera.directedYaw
    if (camera.def.tracking === true && camera.trackYaw !== null) return camera.trackYaw
    return normalizeDegrees(camera.def.defaultAngle)
  }

  private requireCamera(cameraId: string): CameraState {
    const camera = this.cameras.get(cameraId)
    if (camera === undefined) throw new Error(`알 수 없는 카메라입니다: ${cameraId}`)
    return camera
  }

  private requireStaff(staffId: string): StaffState {
    const member = this.staff.get(staffId)
    if (member === undefined) throw new Error(`알 수 없는 스태프입니다: ${staffId}`)
    return member
  }
}
