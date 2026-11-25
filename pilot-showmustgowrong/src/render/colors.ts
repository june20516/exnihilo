import type { Pose } from '@/content/types'

/** 렌더링 색 모음. 0xRRGGBB. */
export const COLORS = {
  background: 0x14141c,
  floor: 0x3a3340,
  floorLine: 0x6b6074,
  audienceZone: 0x2a3a52,
  audienceZoneLine: 0x4d6a94,
  exit: 0x3f8f5f,
  homeSpot: 0xd8c27a,
  benchSpot: 0x8a8f99,
  light: 0xf2e08a,
  setWall: 0x8a6a4a,
  equipmentReleased: 0xe0703a,
  cameraFan: 0x7ab8ff,
  cameraOnAirFan: 0xff5a5a,
  cameraOnAirStroke: 0xe5252a,
  cameraBody: 0xcfd6e0,
  nameText: 0xffffff,
  bubbleFill: 0xffffff,
  bubbleText: 0x1a1a22,
  vignette: 0x000000,
} as const

export const POSE_COLORS: Record<Pose, number> = {
  idle: 0x9aa7b8,
  laugh: 0xf2c94c,
  angry: 0xe5484d,
  panic: 0xb07ee0,
  flying: 0x56c2e6,
  fallen: 0x6f6a78,
}

export const POSE_SYMBOLS: Record<Pose, string> = {
  idle: '',
  laugh: 'ㅋ',
  angry: '#',
  panic: '!',
  flying: '~',
  fallen: '@',
}
