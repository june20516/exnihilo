import { BROADCAST_REAL_SECONDS, STEP_SECONDS } from "@/content/balance";
import type { ShowDef } from "@/content/types";

/** 쇼 배율: 극 중 시간이 실제(방송) 시간보다 몇 배 빠르게 흐르는가. 토크쇼(극 중 30분)는 10이다. */
export function showTimeScale(show: ShowDef): number {
  return (show.showMinutes * 60) / BROADCAST_REAL_SECONDS;
}

/** 극 중 초를 스텝 수로 바꾼다. 아무리 짧아도 1스텝이다. */
export function showSecondsToSteps(showSeconds: number, show: ShowDef): number {
  return Math.max(
    1,
    Math.round(showSeconds / showTimeScale(show) / STEP_SECONDS),
  );
}

/** 스텝 수를 극 중 초로 바꾼다. */
export function stepsToShowSeconds(steps: number, show: ShowDef): number {
  return steps * STEP_SECONDS * showTimeScale(show);
}

/** 해당 스텝의 극 중 시각을 자정부터의 분(소수)으로 돌려준다. */
export function showClockMinutes(step: number, show: ShowDef): number {
  const startMinutes = show.startTime.hour * 60 + show.startTime.minute;
  return startMinutes + stepsToShowSeconds(step, show) / 60;
}
