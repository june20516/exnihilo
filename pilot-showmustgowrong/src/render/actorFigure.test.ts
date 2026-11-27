import { artOrientation, artDisplayScale } from './actorFigure'

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
