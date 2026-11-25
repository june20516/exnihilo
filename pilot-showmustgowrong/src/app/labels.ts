import { BROADCAST_STEPS, STEP_SECONDS } from '@/content/balance'
import type {
  GaugeKind,
  Intensity,
  PhenomenonKind,
  StaffDirectiveDef,
  Weight,
} from '@/content/types'
import type { AdEffect } from '@/sim/director'

export const GAUGE_LABELS: Record<GaugeKind, string> = {
  sexual: '선정성',
  violence: '폭력성',
  drugs: '약물',
  language: '언어',
}

export const PHENOMENON_LABELS: Record<PhenomenonKind, string> = {
  gaze: '시선',
  noise: '소음',
  impact: '충격',
  laughter: '웃음',
  anger: '분노',
  darkness: '어둠',
  exposure: '노출',
  silence: '정적',
}

export const WEIGHT_LABELS: Record<Weight, string> = {
  light: '가벼움',
  normal: '보통',
  heavy: '무거움',
}

/** 스태프 지시의 예상 결과. 스태프 지시는 방향(aim)만 정하므로 방향마다 한 줄로 쓴다. */
export const STAFF_AIM_EXPECT: Record<StaffDirectiveDef['aim'], string> = {
  default: '카메라를 기본 방향으로 되돌림',
  audience: '카메라를 관객석으로 돌림',
  nearestPerformer: '카메라를 가까운 출연자에게 돌림',
}

/** 강도 1~3을 "강도 2"처럼 쓴다. */
export function formatIntensity(intensity: Intensity): string {
  return `강도 ${intensity}`
}

/** 0~1 확률을 "30%"처럼 쓴다. */
export function formatPercent(chance: number): string {
  return `${Math.round(chance * 100)}%`
}

export const AD_EFFECTS: readonly AdEffect[] = ['relief', 'reset', 'setup']

export const AD_EFFECT_LABELS: Record<AdEffect, { title: string; description: string }> = {
  relief: { title: '수위 정리', description: '모든 수위 게이지를 내린다' },
  reset: { title: '재정비', description: '출연자 위치·감정과 누적 피로를 초기화한다' },
  setup: { title: '외적 세팅', description: '대기 게스트를 무대에 투입한다' },
}

/** 카메라 스위처 키(Ruling 26: 1, 2, 3 = wide, close, audienceCam). */
export const SWITCHER_KEYS: readonly string[] = ['1', '2', '3']

/** 시청자 수(천 명 단위)를 "512,300명"처럼 쓴다. */
export function formatViewers(thousands: number): string {
  return `${Math.round(thousands * 1000).toLocaleString('ko-KR')}명`
}

/** 스텝 번호를 "1:05"처럼 방송 경과 시각으로 쓴다. */
export function formatStepTime(step: number): string {
  return formatSeconds(step * STEP_SECONDS)
}

/** 남은 방송 시간 "2:41" */
export function formatRemaining(step: number): string {
  return formatSeconds(Math.max(0, BROADCAST_STEPS - step) * STEP_SECONDS)
}

function formatSeconds(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds)
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
