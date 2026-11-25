import type { ShowDef } from './types'

/**
 * 토크쇼(spec 7.5): 기본 현상만 쓰는 기준 방송.
 * 카메라 각도는 도 단위, +x가 0도, 반시계 방향이다(Ruling 15). 서 있는 출연자의 중심 높이는 약 0.85m.
 */
export const TALK_SHOW: ShowDef = {
  id: 'talkShow',
  name: '한밤의 토크쇼',
  rating: 'TV-14',
  corners: [
    { label: '오프닝', startTag: 'host' },
    { label: '게스트 토크', startTag: 'guest' },
    { label: '게임 코너', startTag: 'athlete' },
  ],
  cameras: [
    // 천장 가운데에서 내려다본다. home spot 4곳(x 4~12)을 모두 잡고 관객석 중앙(x 1.5)은 벗어난다.
    {
      id: 'wide',
      label: '무대 와이드',
      position: { x: 8, y: 8 },
      defaultAngle: -90,
      fovDegrees: 76,
      range: 10,
      shotIntensity: 1,
    },
    // 관객석 쪽 바닥 높이에서 무대를 수평으로 본다. 좁은 화각이라 MC와 패널(x 4, 6.5)만 잡히고,
    // 뛰어오르거나 날아가면 금방 화면에서 빠진다.
    {
      id: 'close',
      label: '클로즈업',
      position: { x: 2.5, y: 1 },
      defaultAngle: 0,
      fovDegrees: 24,
      range: 6.5,
      shotIntensity: 2,
    },
    // 관객 구역(x 0~3) 위에서 내려다본다. 무대의 출연자는 잡지 않는다.
    {
      id: 'audienceCam',
      label: '관객석',
      position: { x: 1.5, y: 5 },
      defaultAngle: -90,
      fovDegrees: 50,
      range: 5,
      shotIntensity: 1,
    },
  ],
  homeSpots: [{ x: 4 }, { x: 6.5 }, { x: 9.5 }, { x: 12 }],
  benchSpot: { x: 15 },
  exitX: 15.8,
  audienceZone: { minX: 0, maxX: 3 },
}
