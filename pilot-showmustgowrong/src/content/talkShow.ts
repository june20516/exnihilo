import type { ShowDef } from './types'

/**
 * 토크쇼(spec 7.5): 기본 현상만 쓰는 기준 방송.
 * 좌표는 미터(x 0~16 가로, y 0~9 높이, z 0~10 깊이). 쿼터뷰는 앞쪽(z 10)에서 비스듬히 내려다본다.
 * 무대는 z 4 줄에 home spot 4곳을 2.5·3·2.5m 간격(Plan 1과 같음)으로 두고, 관객석은 왼쪽(x 0~3)이다.
 * 카메라 방향은 yaw(도), +x가 0도, +z가 90도다. 서 있는 출연자의 중심 높이는 약 0.85m.
 */
export const TALK_SHOW: ShowDef = {
  id: 'talkShow',
  name: '한밤의 토크쇼',
  rating: 'TV-14',
  showMinutes: 30,
  startTime: { hour: 21, minute: 0 },
  traits: ['talk', 'studioAudience'],
  corners: [
    { label: '오프닝', startTag: 'host' },
    { label: '게스트 토크', startTag: 'guest' },
    { label: '게임 코너', startTag: 'athlete' },
  ],
  cameras: [
    // 앞쪽 가운데 높은 곳에서 무대를 내려다본다. home spot 4곳은 방향 ±36° 안(화각 ±40°)에 들고
    // 관객석 중앙(1.5, 4)은 약 52° 밖이다.
    {
      id: 'wide',
      label: '무대 와이드',
      position: { x: 8.5, y: 5, z: 9.5 },
      defaultAngle: -90,
      fovDegrees: 80,
      range: 10,
      shotIntensity: 1,
      backdrop: 'stage',
    },
    // 앞쪽 왼편 어깨높이에서 출연자 한 명을 따라간다. 기본 방향은 첫 home spot(4.5, 4)이고,
    // 좁은 화각이라 옆 home spot(7, 4)은 약 22° 떨어져 빠진다. 사거리는 가장 먼 대기석(15, 6)까지
    // 약 12m에 1m를 더해, 어느 home spot이나 대기석의 출연자를 따라가도 잡힌다(Ruling 56).
    {
      id: 'close',
      label: '클로즈업',
      position: { x: 3.5, y: 1.5, z: 9.5 },
      defaultAngle: -80,
      fovDegrees: 24,
      range: 13,
      shotIntensity: 2,
      tracking: true,
      backdrop: 'stage',
    },
    // 관객석 앞에서 관객석을 본다. 가장 가까운 home spot(4.5, 4)도 약 29° 떨어져 빠진다(화각 ±25°).
    {
      id: 'audienceCam',
      label: '관객석',
      position: { x: 1.5, y: 4, z: 9.5 },
      defaultAngle: -90,
      fovDegrees: 50,
      range: 6.5,
      shotIntensity: 1,
      backdrop: 'audience',
    },
  ],
  homeSpots: [
    { x: 4.5, z: 4 },
    { x: 7, z: 4 },
    { x: 10, z: 4 },
    { x: 12.5, z: 4 },
  ],
  benchSpot: { x: 15, z: 6 },
  exit: { x: 15.8, z: 4 },
  audienceZone: { minX: 0, maxX: 3, minZ: 1, maxZ: 7 },
  // 평소엔 와이드, 클로즈업(출연자 차례), 와이드, 관객석 순으로 돈다. 출연자 사고는 클로즈업, 장비·관객 사고는 와이드로 본다.
  autoCut: { rotation: ['wide', 'close', 'wide', 'audienceCam'], incidentCamera: 'close', fallbackCamera: 'wide' },
}
