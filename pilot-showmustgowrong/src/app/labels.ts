import { BROADCAST_STEPS } from '@/content/balance'
import type {
  CameraDef,
  GaugeKind,
  Intensity,
  PhenomenonKind,
  ShowDef,
  Weight,
} from '@/content/types'
import type { AdEffect } from '@/sim/director'
import { showClockMinutes } from '@/sim/showClock'

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

/** "카메라 2 클로즈업"처럼 스위처 번호와 카메라 이름 */
export function cameraName(cameras: readonly CameraDef[], camera: CameraDef): string {
  return `카메라 ${cameras.indexOf(camera) + 1} ${camera.label}`
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

/** 스텝의 극 중 시각을 "21:07"처럼 쓴다(분 내림, 시는 24로 나눈 나머지). */
export function formatShowClock(step: number, show: ShowDef): string {
  return formatClockMinutes(Math.floor(showClockMinutes(step, show)))
}

/** 방송 종료 극 중 시각 "21:30" */
export function formatShowEnd(show: ShowDef): string {
  return formatShowClock(BROADCAST_STEPS, show)
}

function formatClockMinutes(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60) % 24
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
