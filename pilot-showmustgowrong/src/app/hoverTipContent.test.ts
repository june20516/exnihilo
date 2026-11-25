import { LINEUP } from '@/content/lineup'
import type { EquipmentView, RecentPhenomenon } from '@/sim/engineTypes'
import { hoverTipContent, resolveHoverTip } from './hoverTipContent'

const LIGHT: EquipmentView = {
  id: 'overheatedLight',
  kind: 'hangingLight',
  x: 0,
  y: 0,
  z: 0,
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  released: false,
}

const NOISE: RecentPhenomenon = {
  id: 7,
  kind: 'noise',
  intensity: 2,
  sourceId: 'rex',
  targetId: null,
  x: 0,
  y: 0,
  z: 0,
  ageSeconds: 0.5,
  text: '렉스 쪽에서 소리가 난다',
}

const VIEW = { equipment: [LIGHT], recentPhenomena: [NOISE] }

describe('hoverTipContent', () => {
  it('장비는 이름, 상태, 무엇에 부서지는지 보여 준다', () => {
    const intact = hoverTipContent({ kind: 'equipment', id: LIGHT.id }, VIEW, LINEUP)
    expect(intact).toEqual({ title: '과열된 조명', lines: ['상태: 멀쩡함', '충격 2 이상에 부서짐'] })
    const broken = hoverTipContent(
      { kind: 'equipment', id: LIGHT.id },
      { ...VIEW, equipment: [{ ...LIGHT, released: true }] },
      LINEUP,
    )
    expect(broken?.lines[0]).toBe('상태: 부서짐')
  })

  it('현상은 로그 문구와 종류·강도를 보여 준다', () => {
    expect(hoverTipContent({ kind: 'phenomenon', id: 7 }, VIEW, LINEUP)).toEqual({
      title: '렉스 쪽에서 소리가 난다',
      lines: ['소음 · 강도 2', '원인: 렉스'],
    })
  })

  it('대상이 있는 현상은 원인과 대상을, 방송·관객석 원인은 그 이름을 쓴다', () => {
    const anger: RecentPhenomenon = {
      ...NOISE,
      id: 8,
      kind: 'anger',
      sourceId: 'rex',
      targetId: 'mo',
    }
    const audience: RecentPhenomenon = { ...NOISE, id: 9, sourceId: 'audience' }
    const view = { equipment: [LIGHT], recentPhenomena: [anger, audience] }
    expect(hoverTipContent({ kind: 'phenomenon', id: 8 }, view, LINEUP)?.lines[1]).toBe(
      '원인: 렉스 → 대상: 모',
    )
    expect(hoverTipContent({ kind: 'phenomenon', id: 9 }, view, LINEUP)?.lines[1]).toBe(
      '원인: 관객석',
    )
  })

  it('출연자, 빈 곳, 사라진 현상은 설명이 없다', () => {
    expect(hoverTipContent({ kind: 'actor', id: 'rex' }, VIEW, LINEUP)).toBeNull()
    expect(hoverTipContent(null, VIEW, LINEUP)).toBeNull()
    expect(hoverTipContent({ kind: 'phenomenon', id: 99 }, VIEW, LINEUP)).toBeNull()
  })
})

describe('resolveHoverTip', () => {
  it('자리는 그대로 두고 내용은 지금 view로 다시 만든다(장비가 부서지면 바뀐다)', () => {
    const anchor = { hit: { kind: 'equipment', id: LIGHT.id } as const, x: 40, y: 50 }
    const before = resolveHoverTip(anchor, VIEW, LINEUP)
    const after = resolveHoverTip(
      anchor,
      { ...VIEW, equipment: [{ ...LIGHT, released: true }] },
      LINEUP,
    )
    expect(before).toMatchObject({ x: 40, y: 50, lines: ['상태: 멀쩡함', '충격 2 이상에 부서짐'] })
    expect(after).toMatchObject({ x: 40, y: 50, lines: ['상태: 부서짐', '충격 2 이상에 부서짐'] })
  })

  it('현상이 사라지면 설명을 닫는다(null)', () => {
    const anchor = { hit: { kind: 'phenomenon', id: NOISE.id } as const, x: 10, y: 20 }
    expect(resolveHoverTip(anchor, VIEW, LINEUP)?.title).toBe(NOISE.text)
    expect(resolveHoverTip(anchor, { ...VIEW, recentPhenomena: [] }, LINEUP)).toBeNull()
  })
})
