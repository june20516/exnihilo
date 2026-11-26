import {
  ADS_PER_BROADCAST,
  FATIGUE_MISFIRE_PER_POINT,
  MISFIRE_CAP,
  MISFIRE_MAX_INTENSITY,
  OVERDO_MULTIPLIER,
  STAFF_FATIGUE_MISFIRE_PER_POINT,
  TOLERANCE_COUNT,
} from '@/content/balance'
import type {
  ActionDef,
  EmitDef,
  Intensity,
  MoodShift,
  PerformerDef,
  StaffDef,
  StaffDirectiveDef,
} from '@/content/types'
import { nextFloat, type RngState } from '@/kit/rng'

export type DirectiveOutcome =
  | { kind: 'executed'; action: ActionDef; misfired: boolean; label: string; moodShifts: MoodShift[] }
  | { kind: 'walkout' }

export type AdEffect = 'relief' | 'reset' | 'setup'

export interface StaffDirectiveResult {
  aim: StaffDirectiveDef['aim'] | 'random'
  misfired: boolean
}

function misfireChance(fatigue: number, perPoint: number): number {
  return Math.min(MISFIRE_CAP, fatigue * perPoint)
}

/** 엇나갈 확률이 0이면 rng를 소비하지 않는다. */
function rollMisfire(chance: number, rng: RngState): [boolean, RngState] {
  if (chance <= 0) return [false, rng]
  const [roll, next] = nextFloat(rng)
  return [roll < chance, next]
}

/** causePlusOne은 원인 강도를 엔진이 정하므로 그대로 둔다. */
function shiftEmits(emits: readonly EmitDef[], delta: 1 | -1): EmitDef[] {
  const shifted: EmitDef[] = []
  for (const emit of emits) {
    if (emit.intensity === 'causePlusOne') {
      shifted.push({ ...emit })
      continue
    }
    const intensity = Math.min(MISFIRE_MAX_INTENSITY, emit.intensity + delta)
    if (intensity < 1) continue
    shifted.push({ ...emit, intensity: intensity as Intensity })
  }
  return shifted
}

function misfireAction(action: ActionDef, misfire: 'overdo' | 'awkward'): ActionDef {
  if (misfire === 'awkward') {
    return { ...action, emits: shiftEmits(action.emits, -1) }
  }
  return {
    ...action,
    ...(action.move && { move: { ...action.move, speed: action.move.speed * OVERDO_MULTIPLIER } }),
    emits: shiftEmits(action.emits, 1),
  }
}

/** overdo면 양이 커지고 awkward면 부호가 반대다. 엇나감 판정을 그대로 따르므로 난수를 쓰지 않는다. */
function misfireMoodShifts(shifts: readonly MoodShift[], misfire: 'overdo' | 'awkward'): MoodShift[] {
  // awkward는 0 - amount로 뒤집어 amount 0에서 -0이 생기지 않게 한다.
  return shifts.map((shift) => ({
    ...shift,
    amount: misfire === 'overdo' ? shift.amount * OVERDO_MULTIPLIER : 0 - shift.amount,
  }))
}

/** PD 개입의 상태(내성, 피로, 광고)와 판정. 지시 결과의 실행은 엔진이 맡는다. */
export class Director {
  private currentFatigue = 0
  private currentStaffFatigue = 0
  private currentAdsLeft = ADS_PER_BROADCAST

  private readonly performers = new Map<string, PerformerDef>()
  private readonly staff = new Map<string, StaffDef>()
  private readonly used = new Map<string, number>()
  private readonly walkedOut = new Set<string>()

  constructor(performers: PerformerDef[], staff: StaffDef[]) {
    for (const performer of performers) {
      this.performers.set(performer.id, performer)
      this.used.set(performer.id, 0)
    }
    for (const member of staff) this.staff.set(member.id, member)
  }

  get fatigue(): number {
    return this.currentFatigue
  }

  get staffFatigue(): number {
    return this.currentStaffFatigue
  }

  get adsLeft(): number {
    return this.currentAdsLeft
  }

  directivesUsed(performerId: string): number {
    this.requirePerformer(performerId)
    return this.used.get(performerId) ?? 0
  }

  isWalkedOut(performerId: string): boolean {
    this.requirePerformer(performerId)
    return this.walkedOut.has(performerId)
  }

  /** 지금 지시하면 엇나갈 확률. 상태와 rng를 건드리지 않는다. */
  previewMisfireChance(performerId: string): number {
    const performer = this.requirePerformer(performerId)
    if (performer.misfire === 'never') return 0
    return misfireChance(this.currentFatigue, FATIGUE_MISFIRE_PER_POINT)
  }

  /** 지금 스태프에게 지시하면 엇나갈 확률. 상태와 rng를 건드리지 않는다. */
  previewStaffMisfireChance(staffId: string): number {
    if (!this.staff.has(staffId)) throw new Error(`알 수 없는 스태프입니다: ${staffId}`)
    return misfireChance(this.currentStaffFatigue, STAFF_FATIGUE_MISFIRE_PER_POINT)
  }

  directPerformer(
    performerId: string,
    directiveId: string,
    rng: RngState,
  ): [DirectiveOutcome, RngState] {
    const performer = this.requirePerformer(performerId)
    const directive = performer.directives.find((candidate) => candidate.id === directiveId)
    if (!directive) throw new Error(`출연자 ${performerId}에게 없는 지시입니다: ${directiveId}`)
    if (this.walkedOut.has(performerId)) {
      throw new Error(`이미 이탈한 출연자에게 지시했습니다: ${performerId}`)
    }

    // 엇나감 확률은 이번 지시를 더하기 전의 누적 피로로 계산한다.
    const fatigueBefore = this.currentFatigue
    const used = (this.used.get(performerId) ?? 0) + 1
    this.used.set(performerId, used)
    this.currentFatigue += 1

    if (used > TOLERANCE_COUNT[performer.tolerance]) {
      this.walkedOut.add(performerId)
      return [{ kind: 'walkout' }, rng]
    }
    const moodShifts = (directive.moodShifts ?? []).map((shift) => ({ ...shift }))
    if (performer.misfire === 'never') {
      return [{ kind: 'executed', action: directive.action, misfired: false, label: directive.label, moodShifts }, rng]
    }

    const chance = misfireChance(fatigueBefore, FATIGUE_MISFIRE_PER_POINT)
    const [misfired, next] = rollMisfire(chance, rng)
    if (!misfired) {
      return [{ kind: 'executed', action: directive.action, misfired: false, label: directive.label, moodShifts }, next]
    }
    const action = misfireAction(directive.action, performer.misfire)
    const shifts = misfireMoodShifts(moodShifts, performer.misfire)
    return [{ kind: 'executed', action, misfired: true, label: directive.label, moodShifts: shifts }, next]
  }

  directStaff(
    staffId: string,
    directiveId: string,
    rng: RngState,
  ): [StaffDirectiveResult, RngState] {
    const member = this.staff.get(staffId)
    if (!member) throw new Error(`알 수 없는 스태프입니다: ${staffId}`)
    const directive = member.directives.find((candidate) => candidate.id === directiveId)
    if (!directive) throw new Error(`스태프 ${staffId}에게 없는 지시입니다: ${directiveId}`)

    const staffFatigueBefore = this.currentStaffFatigue
    this.currentStaffFatigue += 1
    const chance = misfireChance(staffFatigueBefore, STAFF_FATIGUE_MISFIRE_PER_POINT)
    const [misfired, next] = rollMisfire(chance, rng)
    return [{ aim: misfired ? 'random' : directive.aim, misfired }, next]
  }

  takeAd(): boolean {
    if (this.currentAdsLeft <= 0) return false
    this.currentAdsLeft -= 1
    return true
  }

  /** 광고 재정비용. 출연자 누적 피로만 0으로 되돌린다. */
  resetFatigue(): void {
    this.currentFatigue = 0
  }

  private requirePerformer(performerId: string): PerformerDef {
    const performer = this.performers.get(performerId)
    if (!performer) throw new Error(`알 수 없는 출연자입니다: ${performerId}`)
    return performer
  }
}
