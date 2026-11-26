import { describe, expect, it } from "vitest";
import {
  BROADCAST_REAL_SECONDS,
  BROADCAST_STEPS,
  STEP_SECONDS,
} from "@/content/balance";
import { TALK_SHOW } from "@/content/talkShow";
import {
  showClockMinutes,
  showSecondsToSteps,
  showTimeScale,
  stepsToShowSeconds,
} from "./showClock";

describe("극 중 시계", () => {
  it("방송 길이는 실제 180초, 10800스텝이다", () => {
    expect(BROADCAST_REAL_SECONDS).toBe(180);
    expect(BROADCAST_STEPS).toBe(10800);
    expect(BROADCAST_STEPS).toBe(
      Math.round(BROADCAST_REAL_SECONDS / STEP_SECONDS),
    );
  });

  it("토크쇼(극 중 30분)의 배율은 10이다", () => {
    expect(showTimeScale(TALK_SHOW)).toBe(10);
  });

  it("극 중 50초는 토크쇼에서 300스텝(실제 5초), 극 중 60분 쇼에서 150스텝이다", () => {
    expect(showSecondsToSteps(50, TALK_SHOW)).toBe(300);
    expect(showSecondsToSteps(50, { ...TALK_SHOW, showMinutes: 60 })).toBe(150);
  });

  it("아무리 짧은 극 중 시간도 최소 1스텝이다", () => {
    expect(showSecondsToSteps(0, TALK_SHOW)).toBe(1);
  });

  it("스텝을 극 중 초로 되돌린다", () => {
    expect(stepsToShowSeconds(300, TALK_SHOW)).toBeCloseTo(50);
    expect(stepsToShowSeconds(BROADCAST_STEPS, TALK_SHOW)).toBeCloseTo(30 * 60);
  });

  it("스텝 0은 21:00, 마지막 스텝은 21:30이다", () => {
    expect(showClockMinutes(0, TALK_SHOW)).toBe(21 * 60);
    expect(showClockMinutes(BROADCAST_STEPS, TALK_SHOW)).toBe(21 * 60 + 30);
  });
});
