import {
  AD_BREAK_REAL_SECONDS,
  AUTO_SLOWMO_REAL_SECONDS,
  INTERVENTION_REAL_SECONDS,
  INTERVENTION_SPEED,
  MAX_FRAME_REAL_SECONDS,
} from '@/content/balance'
import { Clock } from '@/sim/clock'
import type { AdEffect } from '@/sim/director'
import type { ActorView, AutoSlowmo, BroadcastInput, Phase } from '@/sim/engineTypes'

/** 루프가 view에서 읽는 필드. */
export interface LoopViewFields {
  phase: Phase
  autoSlowmo: AutoSlowmo | null
  actors: readonly Pick<ActorView, 'id' | 'walkedOut' | 'departed'>[]
}

/** 루프가 돌리는 방송. 실제로는 Broadcast이고, 테스트에서는 가짜로 바꾼다. */
export interface LoopBroadcast<V extends LoopViewFields> {
  readonly phase: Phase
  step(inputs?: readonly BroadcastInput[]): void
  resumeFromAd(): void
  view(): V
}

export type Slowmo = 'none' | 'auto' | 'intervention'

export interface LoopSnapshot {
  /** 'intervention'은 플레이어가 연 패널(개입, 광고 패널) 때문에 느려진 것이다. */
  slowmo: Slowmo
  interventionOpen: boolean
  interventionSecondsLeft: number
  /** 실제로 지시를 내린 횟수. 시간이 다 되거나 취소한 개입은 세지 않는다. */
  interventionsIssued: number
  adPanelOpen: boolean
  adBreak: boolean
  adBreakSecondsLeft: number
  ended: boolean
}

/**
 * 생방송 화면의 실시간 루프(React와 무관). 매 프레임 실제 경과 시간을 받아
 * 속도 상태(평상시, 자동 슬로모션, 개입, 광고 패널, 광고 중)에 맞게 Clock을 돌리고
 * 나온 스텝 수만큼 broadcast.step을 부른다. 보낸 입력은 다음 스텝에 한 번만 들어간다.
 */
export class BroadcastLoop<V extends LoopViewFields> {
  private readonly broadcast: LoopBroadcast<V>
  private readonly clock = new Clock()
  private queuedInputs: BroadcastInput[] = []
  private interventionOpen = false
  private interventionSecondsLeft = 0
  private interventionsIssued = 0
  private autoSlowmoSecondsLeft = 0
  /** 이미 반응한 자동 슬로모션 계기의 step(Ruling 19). */
  private lastAutoSlowmoStep: number | null = null
  private adPanelOpen = false
  /** 확정한 광고 입력이 아직 스텝에 들어가지 않았다. */
  private adPending = false
  private adBreak = false
  private adBreakSecondsLeft = 0
  private ended = false
  private currentView: V

  constructor(broadcast: LoopBroadcast<V>) {
    this.broadcast = broadcast
    this.currentView = broadcast.view()
    this.syncWithView()
  }

  get view(): V {
    return this.currentView
  }

  /** 입력을 다음 스텝에 보낸다. 지시(출연자, 스태프)는 열려 있던 개입을 닫고 개입으로 센다. */
  send(input: BroadcastInput): void {
    if (this.ended) return
    this.queuedInputs.push(input)
    if (input.type === 'direct' || input.type === 'directStaff') {
      this.interventionsIssued += 1
      this.interventionOpen = false
    }
  }

  /** 이미 열려 있으면 남은 시간을 그대로 둔다(대상만 바꾸는 클릭). */
  openIntervention(): void {
    if (this.ended || this.adBreak || this.adPanelOpen || this.interventionOpen) return
    this.interventionOpen = true
    this.interventionSecondsLeft = INTERVENTION_REAL_SECONDS
  }

  closeIntervention(): void {
    this.interventionOpen = false
  }

  /** 광고 효과를 고르는 패널(Ruling 5). 열려 있던 개입은 세지 않고 닫는다. */
  openAdPanel(): void {
    if (this.ended || this.adBreak || this.adPending) return
    this.interventionOpen = false
    this.adPanelOpen = true
  }

  cancelAdPanel(): void {
    this.adPanelOpen = false
  }

  /** 고른 효과로 'ad' 입력을 보낸다(Ruling 4). 그 스텝에 효과가 적용되고 광고가 시작된다. */
  confirmAd(effects: AdEffect[]): void {
    if (this.ended || this.adBreak || this.adPending) return
    this.adPanelOpen = false
    this.adPending = true
    this.queuedInputs.push({ type: 'ad', effects: [...effects] })
  }

  /** 한 프레임. realSeconds는 직전 프레임부터 흐른 실제 시간(초). */
  frame(realSeconds: number): V {
    if (this.ended) return this.currentView
    const seconds = Math.min(Math.max(0, realSeconds), MAX_FRAME_REAL_SECONDS)

    if (this.adBreak) {
      this.adBreakSecondsLeft = Math.max(0, this.adBreakSecondsLeft - seconds)
      if (this.adBreakSecondsLeft === 0) {
        this.adBreak = false
        this.broadcast.resumeFromAd()
      }
      return this.refresh()
    }

    this.clock.speed = this.isSlowed() ? INTERVENTION_SPEED : 1
    const steps = this.clock.advance(seconds)
    for (let index = 0; index < steps && this.broadcast.phase === 'live'; index++) {
      const inputs = this.stillValid(this.queuedInputs)
      this.queuedInputs = []
      this.broadcast.step(inputs)
    }
    this.tickTimers(seconds)
    return this.refresh()
  }

  snapshot(): LoopSnapshot {
    return {
      slowmo: this.slowmo(),
      interventionOpen: this.interventionOpen,
      interventionSecondsLeft: this.interventionOpen ? this.interventionSecondsLeft : 0,
      interventionsIssued: this.interventionsIssued,
      adPanelOpen: this.adPanelOpen,
      adBreak: this.adBreak,
      adBreakSecondsLeft: this.adBreakSecondsLeft,
      ended: this.ended,
    }
  }

  /**
   * Ruling 35: 큐에 쌓인 지시가 그사이 이탈한(출구로 걸어가거나 빠진) 출연자를 가리키면
   * 넘기기 전에 버린다. 엔진은 그런 지시에 그대로 throw한다.
   */
  private stillValid(inputs: BroadcastInput[]): BroadcastInput[] {
    const gone = new Set(
      this.currentView.actors
        .filter((actor) => actor.walkedOut || actor.departed)
        .map((actor) => actor.id),
    )
    if (gone.size === 0) return inputs
    return inputs.filter((input) => input.type !== 'direct' || !gone.has(input.actorId))
  }

  private slowmo(): Slowmo {
    if (this.interventionOpen || this.adPanelOpen) return 'intervention'
    if (this.autoSlowmoSecondsLeft > 0) return 'auto'
    return 'none'
  }

  private isSlowed(): boolean {
    return this.slowmo() !== 'none'
  }

  private tickTimers(seconds: number): void {
    this.autoSlowmoSecondsLeft = Math.max(0, this.autoSlowmoSecondsLeft - seconds)
    if (!this.interventionOpen) return
    this.interventionSecondsLeft = Math.max(0, this.interventionSecondsLeft - seconds)
    // 지시 없이 시간이 다 되면 그냥 닫는다(개입으로 세지 않는다).
    if (this.interventionSecondsLeft === 0) this.interventionOpen = false
  }

  private refresh(): V {
    this.currentView = this.broadcast.view()
    this.syncWithView()
    return this.currentView
  }

  /** view의 phase와 자동 슬로모션 계기를 루프 상태에 반영한다. */
  private syncWithView(): void {
    const { phase, autoSlowmo } = this.currentView
    if (phase === 'ended') {
      this.ended = true
      this.closePanels()
      this.autoSlowmoSecondsLeft = 0
      return
    }
    if (phase === 'adBreak' && !this.adBreak) {
      this.adBreak = true
      this.adPending = false
      this.adBreakSecondsLeft = AD_BREAK_REAL_SECONDS
      this.closePanels()
    }
    if (autoSlowmo !== null && autoSlowmo.step !== this.lastAutoSlowmoStep) {
      this.lastAutoSlowmoStep = autoSlowmo.step
      this.autoSlowmoSecondsLeft = AUTO_SLOWMO_REAL_SECONDS
    }
  }

  private closePanels(): void {
    this.interventionOpen = false
    this.adPanelOpen = false
  }
}
