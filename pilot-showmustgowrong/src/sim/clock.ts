import { MAX_STEPS_PER_FRAME, STEP_SECONDS } from '@/content/balance'

/** 부동소수 누적 오차로 한 스텝이 밀리지 않게 하는 여유 */
const STEP_EPSILON = 1e-9

/**
 * 실제 경과 시간을 고정 스텝 수로 바꾼다. 슬로모션은 speed만 낮춘다(dt는 그대로).
 * 실제 시간은 이 클래스의 입력으로만 sim에 들어온다.
 */
export class Clock {
  speed = 1
  private accumulatedSteps = 0

  /** 이번 프레임에 돌릴 스텝 수. MAX_STEPS_PER_FRAME을 넘으면 넘친 나머지는 버린다. */
  advance(realSeconds: number): number {
    if (realSeconds > 0 && this.speed > 0) {
      this.accumulatedSteps += (realSeconds / STEP_SECONDS) * this.speed
    }
    const steps = Math.floor(this.accumulatedSteps + STEP_EPSILON)
    if (steps >= MAX_STEPS_PER_FRAME) {
      this.accumulatedSteps = 0
      return MAX_STEPS_PER_FRAME
    }
    this.accumulatedSteps = Math.max(0, this.accumulatedSteps - steps)
    return steps
  }
}
