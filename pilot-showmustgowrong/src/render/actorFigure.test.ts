import type { Vec3 } from '@/sim/vec'
import type { MoodView } from '@/sim/life'
import {
  artDisplayScale,
  artOrientation,
  figureLayout,
  MIN_NAME_TAG_SCALE,
  nameTagVisible,
  overheadLayout,
  type ArtOrientation,
} from './actorFigure'
import { fitIso } from './geometry'

describe('artOrientation', () => {
  const MAX = Math.PI / 6

  it('서 있는 포즈는 캡슐처럼 몸 위 방향(tilt)만큼 발밑에서 돌린다', () => {
    expect(artOrientation('idle', 0)).toEqual({ rotation: 0, mirrored: false, anchor: 'feet' })
    expect(artOrientation('angry', 0.3)).toEqual({ rotation: 0.3, mirrored: false, anchor: 'feet' })
  })

  it('쓰러짐은 바닥에 붙이고 날아감은 몸 중심에 건다', () => {
    expect(artOrientation('fallen', Math.PI / 2).anchor).toBe('floor')
    expect(artOrientation('flying', Math.PI / 2).anchor).toBe('center')
  })

  it('누운 그림(머리 오른쪽)은 머리가 오른쪽으로 누우면 돌리지 않는다', () => {
    expect(artOrientation('fallen', Math.PI / 2)).toEqual({
      rotation: 0,
      mirrored: false,
      anchor: 'floor',
    })
  })

  it('머리가 왼쪽으로 누우면 좌우만 뒤집는다', () => {
    expect(artOrientation('fallen', -Math.PI / 2)).toEqual({
      rotation: 0,
      mirrored: true,
      anchor: 'floor',
    })
  })

  it('바닥의 x축·z축을 따라 누운 몸은 바닥 선 기울기(30도)를 그대로 따른다', () => {
    // up이 +x면 화면에서 오른쪽 아래 30도(tilt 120도), +z면 왼쪽 아래 30도(tilt -120도)다.
    const alongX = artOrientation('fallen', (2 * Math.PI) / 3)
    expect(alongX.mirrored).toBe(false)
    expect(alongX.rotation).toBeCloseTo(MAX)
    const alongZ = artOrientation('fallen', (-2 * Math.PI) / 3)
    expect(alongZ.mirrored).toBe(true)
    expect(alongZ.rotation).toBeCloseTo(-MAX)
  })

  it('몸이 선 채로 날거나 넘어져도 누운 그림을 세우지 않고 30도까지만 기울인다', () => {
    const upright = artOrientation('flying', 0)
    expect(upright.mirrored).toBe(false)
    expect(upright.rotation).toBeCloseTo(-MAX)
    for (let tilt = -Math.PI; tilt <= Math.PI; tilt += 0.1) {
      expect(Math.abs(artOrientation('fallen', tilt).rotation)).toBeLessThanOrEqual(MAX + 1e-9)
    }
  })
})

describe('artDisplayScale', () => {
  it('기준 그림 높이 256px가 캡슐 키 1.7m의 화면 높이가 된다', () => {
    const scale = 40
    expect(256 * artDisplayScale(scale)).toBeCloseTo(1.7 * scale)
  })
})

describe('figureLayout', () => {
  // 화면 = (x, -y)로 놓는 단순 투영. z는 무시한다.
  const project = (point: Vec3) => ({ x: point.x * 100, y: -point.y * 100 })
  const size = { width: 40, height: 100 }
  const upright: ArtOrientation = { rotation: 0, mirrored: false, anchor: 'feet' }

  it('서 있으면 발끝(중심 - up × 0.85m)에서 반 키 위가 중심이다', () => {
    const body = { x: 1, y: 0.85, z: 0, up: { x: 0, y: 1, z: 0 } }
    const layout = figureLayout(body, upright, size, project)
    expect(layout.center.x).toBeCloseTo(100)
    expect(layout.center.y).toBeCloseTo(-50)
    expect(layout.spriteOffset.x).toBeCloseTo(0)
    expect(layout.spriteOffset.y).toBeCloseTo(50)
    expect(layout.extentY).toBeCloseTo(50)
  })

  it('날아가면 몸 중심이 그림 중심이고 거는 점 차이가 없다', () => {
    const body = { x: 2, y: 1.5, z: 0, up: { x: 0, y: 1, z: 0 } }
    const flying: ArtOrientation = { rotation: 0, mirrored: false, anchor: 'center' }
    const layout = figureLayout(body, flying, { width: 100, height: 40 }, project)
    expect(layout.center).toEqual({ x: 200, y: -150 })
    expect(layout.spriteOffset).toEqual({ x: 0, y: 0 })
    expect(layout.extentY).toBeCloseTo(20)
  })

  it('쓰러지면 몸 높이와 관계없이 몸 중심 아래 바닥에 그림 아래 끝을 붙인다', () => {
    const body = { x: 1, y: 0.35, z: 0, up: { x: 1, y: 0, z: 0 } }
    const fallen: ArtOrientation = { rotation: 0, mirrored: false, anchor: 'floor' }
    const layout = figureLayout(body, fallen, { width: 100, height: 40 }, project)
    expect(layout.center.x).toBeCloseTo(100)
    expect(layout.center.y).toBeCloseTo(-20)
    expect(layout.spriteOffset.y).toBeCloseTo(20)
  })

  it('돌아간 그림은 회전 방향으로 중심이 옮겨 가고 위아래 폭이 회전을 따른다', () => {
    const body = { x: 0, y: 0.85, z: 0, up: { x: 0, y: 1, z: 0 } }
    const tilted: ArtOrientation = { rotation: Math.PI / 2, mirrored: false, anchor: 'feet' }
    const layout = figureLayout(body, tilted, size, project)
    expect(layout.center.x).toBeCloseTo(50)
    expect(layout.center.y).toBeCloseTo(0)
    expect(layout.extentY).toBeCloseTo(20)
  })
})

describe('overheadLayout', () => {
  const mood: MoodView = { emotion: 'boredom', name: '지루함', stage: 1, stageName: '지루함', value: 60 }
  const badge = { radius: 14, bottomExtent: 30 }
  const habit = { emote: '🥱', startedStep: 10 }

  it('버릇 이모트가 있으면 배지 오른쪽 위에, 없으면 숨긴다', () => {
    expect(overheadLayout({ mood, habit }, badge).emote).toEqual({ text: '🥱', x: 12.6, y: -12.6 })
    expect(overheadLayout({ mood, habit: null }, badge).emote).toBeNull()
  })

  it('배지가 보이면 배지 아래 끝만큼 올린다', () => {
    const layout = overheadLayout({ mood, habit: null }, badge)
    expect(layout.badgeVisible).toBe(true)
    expect(layout.lift).toBe(4 + 30)
  })

  it('마음이 없어 배지가 숨으면 지난 배지 크기를 무시하고 이모트를 머리 바로 위에 둔다', () => {
    const layout = overheadLayout({ mood: null, habit }, badge)
    expect(layout.badgeVisible).toBe(false)
    expect(layout.lift).toBe(4)
    expect(layout.emote).toEqual({ text: '🥱', x: 10, y: -10 })
  })
})

describe('nameTagVisible', () => {
  /** StudioRenderer의 fitIso 여백(px) */
  const FIT_PADDING = 16
  /** 1280×720에서 잰 스튜디오 host 크기(CSS px)의 확대 비율 */
  const scaleOf = (width: number, height: number) => fitIso(width, height, FIT_PADDING).scale

  it('송출 화면 크게의 스튜디오 축소판(256×142)에서는 이름표를 숨긴다', () => {
    expect(nameTagVisible(scaleOf(256, 142))).toBe(false)
    expect(nameTagVisible(MIN_NAME_TAG_SCALE - 0.01)).toBe(false)
  })

  it('기본 배치(486×652)와 스튜디오 크게(716×652)에서는 이름표를 그린다', () => {
    expect(nameTagVisible(MIN_NAME_TAG_SCALE)).toBe(true)
    expect(nameTagVisible(scaleOf(486, 652))).toBe(true)
    expect(nameTagVisible(scaleOf(716, 652))).toBe(true)
  })
})
