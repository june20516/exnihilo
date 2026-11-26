import { JUNE_MIND } from './minds/june'
import { MO_MIND } from './minds/mo'
import { OKAFOR_MIND } from './minds/okafor'
import { PRIYA_MIND } from './minds/priya'
import { REX_MIND } from './minds/rex'
import type { ActionDef, EquipmentDef, PerformerDef, StaffDef } from './types'

/**
 * Plan 1 고정 라인업(spec 7.1~7.3). 출연자 성격은 반응과 지시 데이터로만 표현한다.
 * 무대 출연자 순서가 home spot 순서다(x 4, 6.5, 9.5, 12).
 */

const BODY_SLAM: ActionDef = {
  pose: 'angry',
  move: { type: 'leap', toward: 'cause', speed: 8 },
  emits: [],
}

/** 프라임타임 앵커였다가 생방송 욕설로 강등된 MC. 점화 */
const REX: PerformerDef = {
  id: 'rex',
  name: '렉스 캘러웨이',
  shortName: '렉스',
  role: 'MC',
  tendency:
    '화면 밖에 오래 있으면 주목 욕구가 쌓여 카메라로 돌진. 비웃음엔 짜증',
  presence: 3,
  tolerance: 'high',
  weight: 'normal',
  tags: ['host'],
  misfire: 'overdo',
  mind: REX_MIND,
  reactions: [
    {
      trigger: { kind: 'corner', tag: 'host' },
      action: { pose: 'idle', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
    },
  ],
  directives: [
    {
      id: 'stepUp',
      label: '카메라 앞으로 나오세요',
      expect: '송출 화면 안으로 걸어 들어가 소음 1 (주목 욕구 ▼)',
      action: {
        pose: 'idle',
        move: { type: 'walk', toward: 'onAirFrame', speed: 4 },
        emits: [{ kind: 'noise', intensity: 1, target: 'none' }],
      },
      moodShifts: [{ emotion: 'attention', amount: -40 }],
    },
    {
      id: 'pressGuest',
      label: '게스트를 몰아붙이세요',
      expect: '게스트에게 분노 2 (짜증 ▼)',
      action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 2, target: { tag: 'guest' } }] },
      moodShifts: [{ emotion: 'irritation', amount: -20 }],
    },
  ],
}

/** 웃음을 못 참아 TV에서 잘린 스탠드업 코미디언 패널. 증폭 */
const PRIYA: PerformerDef = {
  id: 'priya',
  name: '프리야 네어',
  shortName: '프리야',
  role: '패널',
  tendency: '웃음 1↑ 인지하면 웃음 +1로 키움. 소음 3이면 웃음 2',
  presence: 2,
  tolerance: 'normal',
  weight: 'light',
  tags: ['panel'],
  misfire: 'overdo',
  mind: PRIYA_MIND,
  reactions: [
    {
      trigger: { kind: 'laughter', min: 1, scope: 'perceived' },
      action: {
        pose: 'laugh',
        emits: [{ kind: 'laughter', intensity: 'causePlusOne', target: 'cause' }],
      },
    },
    {
      trigger: { kind: 'noise', min: 3, scope: 'perceived' },
      action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 2, target: 'cause' }] },
    },
  ],
  directives: [
    {
      id: 'laughBig',
      label: '크게 웃어 주세요',
      expect: '웃음 2 (흥분 ▲)',
      action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 2, target: 'none' }] },
      moodShifts: [{ emotion: 'excitement', amount: 20 }],
    },
    {
      id: 'cutHost',
      label: 'MC 한 번 끊어 주세요',
      expect: 'MC에게 웃음 2 → 렉스의 짜증이 쌓임 (흥분 ▲)',
      action: {
        pose: 'laugh',
        emits: [{ kind: 'laughter', intensity: 2, target: { tag: 'host' } }],
      },
      moodShifts: [{ emotion: 'excitement', amount: 10 }],
    },
  ],
}

/** 온라인에서 박사 학위를 산 자칭 전문가 게스트. 변환 */
const OKAFOR: PerformerDef = {
  id: 'okafor',
  name: '제럴드 오카포 박사',
  shortName: '오카포',
  role: '게스트',
  tendency: '자기를 향한 웃음·분노에 짜증이 쌓여 기여가 큰 사람에게 버럭',
  presence: 1,
  tolerance: 'low',
  weight: 'normal',
  tags: ['guest'],
  misfire: 'awkward',
  mind: OKAFOR_MIND,
  reactions: [
    {
      trigger: { kind: 'corner', tag: 'guest' },
      action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 1, target: { tag: 'host' } }] },
    },
  ],
  directives: [
    {
      id: 'rebut',
      label: '반박하세요',
      expect: 'MC에게 분노 2 (짜증 ▼)',
      action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 2, target: { tag: 'host' } }] },
      moodShifts: [{ emotion: 'irritation', amount: -25 }],
    },
    {
      id: 'approachHost',
      label: 'MC한테 가 보세요',
      expect: 'MC에게 돌진, 소음 1 (짜증 ▲)',
      action: {
        pose: 'idle',
        move: { type: 'dash', toward: { tag: 'host' }, speed: 4 },
        emits: [{ kind: 'noise', intensity: 1, target: 'none' }],
      },
      moodShifts: [{ emotion: 'irritation', amount: 15 }],
    },
    {
      id: 'calmDown',
      label: '진정하세요',
      expect: '짜증 ▼ 크게',
      action: { pose: 'idle', emits: [] },
      moodShifts: [{ emotion: 'irritation', amount: -40 }],
    },
  ],
}

/** 링 습관이 남은 사모아계 전직 레슬러. 폭탄 */
const MO: PerformerDef = {
  id: 'mo',
  name: '"마운틴" 모 타비타',
  shortName: '모',
  role: '레슬러',
  tendency: '분노·소음·충돌에 흥분이 쌓여 바디슬램. 충돌을 받으면 바로 바디슬램',
  presence: 2,
  tolerance: 'normal',
  weight: 'heavy',
  tags: ['athlete'],
  misfire: 'overdo',
  mind: MO_MIND,
  reactions: [
    {
      trigger: { kind: 'impact', min: 1, scope: 'targetsSelf' },
      action: BODY_SLAM,
    },
    {
      trigger: { kind: 'corner', tag: 'athlete' },
      action: { pose: 'idle', emits: [{ kind: 'noise', intensity: 2, target: 'none' }] },
    },
  ],
  directives: [
    {
      id: 'flex',
      label: '힘 자랑 해 주세요',
      expect: '도약하며 소음 2 (흥분 ▼)',
      action: {
        pose: 'angry',
        move: { type: 'leap', toward: 'none', speed: 6 },
        emits: [{ kind: 'noise', intensity: 2, target: 'none' }],
      },
      moodShifts: [{ emotion: 'excitement', amount: -30 }],
    },
    {
      id: 'approachHost',
      label: 'MC한테 가 보세요',
      expect: 'MC에게 돌진(충돌 위험) (흥분 ▲)',
      action: {
        pose: 'idle',
        move: { type: 'dash', toward: { tag: 'host' }, speed: 6 },
        emits: [],
      },
      moodShifts: [{ emotion: 'excitement', amount: 20 }],
    },
  ],
}

/** 추첨으로 출연권을 얻은 40년 애청자. 안정. 다치면 폭력성 2배 */
const JUNE: PerformerDef = {
  id: 'june',
  name: '준 휘태커 할머니',
  shortName: '준',
  role: '시청자',
  tendency: '정적이면 수다 욕구가 쌓여 옛날이야기. 소음 3이면 놀라 넘어짐',
  presence: 3,
  tolerance: 'max',
  weight: 'light',
  tags: ['viewer'],
  misfire: 'awkward',
  hitViolenceMultiplier: 2,
  mind: JUNE_MIND,
  reactions: [
    {
      trigger: { kind: 'noise', min: 3, scope: 'perceived' },
      action: { pose: 'fallen', move: { type: 'leap', toward: 'none', speed: 2 }, emits: [] },
    },
  ],
  directives: [
    {
      id: 'story',
      label: '옛날이야기 해 주세요',
      expect: '웃음 1로 정적을 깸 (수다 욕구 ▼)',
      action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'none' }] },
      moodShifts: [{ emotion: 'chatter', amount: -50 }],
    },
    {
      id: 'stepUp',
      label: '카메라 앞으로 나오세요',
      expect: '송출 화면 안으로 천천히 걸어 들어감',
      action: {
        pose: 'idle',
        move: { type: 'walk', toward: 'onAirFrame', speed: 2 },
        emits: [],
      },
    },
  ],
}

/** 근처 소음 2 이상이면 담당 카메라를 휘두른다(엔진이 카메라 각도를 무작위로 바꾼다). */
const COWARD_CAMERA_OPERATOR: StaffDef = {
  id: 'cameraOperator',
  name: '겁쟁이 카메라 감독',
  shortName: '카메라 감독',
  role: '카메라 감독',
  tendency: '소음 2↑ 인지하면 놀라 카메라를 휘두름 → 잠시 뒤 스스로 기준 방향으로 복구',
  cameraId: 'close',
  reactions: [
    {
      trigger: { kind: 'noise', min: 2, scope: 'perceived' },
      action: { pose: 'panic', emits: [] },
    },
  ],
  directives: [
    {
      id: 'aimAudience',
      label: '관객석 비춰 주세요',
      expect: '카메라를 관객석으로 돌려 유지',
      aim: 'audience',
    },
    {
      id: 'calmDown',
      label: '침착하세요',
      expect: '카메라를 기준 방향(추적 중이면 대상)으로 되돌림',
      aim: 'default',
    },
  ],
}

const OVERHEATED_LIGHT: EquipmentDef = {
  id: 'overheatedLight',
  name: '과열된 조명',
  kind: 'hangingLight',
  // 조명의 position은 중심이다(Ruling 12). 두 번째와 세 번째 home spot(x 7, 10) 사이 무대 줄 위.
  // 아래면 2.3m: 서 있는 출연자(머리 1.7m)는 지나가고, 모의 바디슬램(leap 8, 머리가 약 2.9m까지
  // 오름)이나 날아간 출연자는 닿는다(Ruling 28).
  position: { x: 8.5, y: 2.5, z: 4 },
  breakAt: 2,
  onBreak: [
    { kind: 'impact', intensity: 3, target: 'none' },
    { kind: 'noise', intensity: 3, target: 'none' },
  ],
  // 두 home spot(x 7, 10)을 덮는다(각 1.5m 거리).
  darknessZone: { x: 8.5, z: 4, radius: 2 },
}

const COLLAPSING_SET_WALL: EquipmentDef = {
  id: 'setWall',
  name: '무너지는 세트 벽',
  kind: 'setWall',
  // 세트 벽의 position.y는 바닥면이다(Ruling 12). 무대 뒤쪽(z 2.5)에 x 12~15로 서서 앞쪽 카메라의
  // 시선을 가리지 않는다. 풀려나면 앞(+z)으로 쓰러져 네 번째 home spot(12.5, 4)을 덮친다.
  position: { x: 13.5, y: 0, z: 2.5 },
  breakAt: 2,
  onBreak: [
    { kind: 'impact', intensity: 3, target: 'none' },
    { kind: 'exposure', intensity: 1, target: 'none' },
  ],
}

export interface Lineup {
  performers: PerformerDef[]
  bench: PerformerDef[]
  staff: StaffDef[]
  equipment: EquipmentDef[]
}

export const LINEUP: Lineup = {
  performers: [REX, PRIYA, OKAFOR, MO],
  bench: [JUNE],
  staff: [COWARD_CAMERA_OPERATOR],
  equipment: [OVERHEATED_LIGHT, COLLAPSING_SET_WALL],
}

/** 준을 무대에 올린 라인업(L7): 모 자리에 준이 서고 모는 대기석에 있다. 무입력 검증(living spec 7.1)용 */
export const JUNE_LINEUP: Lineup = {
  ...LINEUP,
  performers: [REX, PRIYA, OKAFOR, JUNE],
  bench: [MO],
}
