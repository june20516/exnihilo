// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LINEUP } from '@/content/lineup'
import type { PerformerDef } from '@/content/types'
import type { ActorView } from '@/sim/engineTypes'
import type { EmotionView } from '@/sim/life'
import { ActorInfoCard } from './ActorInfoCard'

const REX: PerformerDef = LINEUP.performers.find((performer) => performer.id === 'rex')!

const nameOf = (id: string): string => (id === 'rex' ? '렉스' : id)

function emotion(
  id: string,
  name: string,
  value: number,
  overrides: Partial<EmotionView> = {},
): EmotionView {
  return { id, name, value, stage: 0, rise: [40, 70], reasons: [], ...overrides }
}

const EMOTIONS: EmotionView[] = [
  emotion('irritation', '짜증', 55, {
    stage: 1,
    reasons: [
      { emotion: 'irritation', source: { type: 'directive', label: '몰아붙이세요' }, amount: 8.4 },
      { emotion: 'irritation', source: { type: 'situation', key: 'a', label: { noun: '무시', clause: '무시당한' } }, amount: 20.2 },
      { emotion: 'irritation', source: { type: 'directive', label: '앞으로' }, amount: 3 },
      { emotion: 'irritation', source: { type: 'directive', label: '네 번째' }, amount: 1 },
      { emotion: 'irritation', source: { type: 'relief' }, amount: -9 },
    ],
  }),
  emotion('excitement', '흥분', 10),
  emotion('anxiety', '불안', 80, { stage: 2 }),
  emotion('boredom', '지루함', 0),
  emotion('attention', '주목 욕구', 30),
]

const BASE_ACTOR: ActorView = {
  id: 'rex',
  name: '렉스 캘러웨이',
  x: 0,
  y: 0,
  z: 0,
  up: { x: 0, y: 1, z: 0 },
  pose: 'idle',
  onAir: true,
  walkedOut: false,
  departed: false,
  directivesLeft: 3,
  mood: { emotion: 'irritation', name: '짜증', stage: 1, stageName: '부글부글', value: 55 },
  emotions: EMOTIONS,
  misfireChance: 0,
  takeover: null,
  habit: null,
}

function renderCard(actor: Partial<ActorView> = {}) {
  return render(<ActorInfoCard actor={{ ...BASE_ACTOR, ...actor }} performer={REX} nameOf={nameOf} />)
}

describe('ActorInfoCard', () => {
  afterEach(cleanup)

  it('머리에 이름, 역할, 대표 감정과 단계 이름, 내성 점 수', () => {
    renderCard()
    const card = screen.getByTestId('actor-card')
    expect(card.textContent).toContain(REX.name)
    expect(card.textContent).toContain(REX.role)
    expect(screen.getByTestId('card-mood').textContent).toContain('짜증 · 부글부글')
    expect(screen.getByTestId('card-tolerance').textContent).toContain('남은 내성 3')
    expect(within(screen.getByTestId('card-tolerance')).getAllByTestId('tolerance-dot-filled')).toHaveLength(3)
  })

  it('대표 감정 이름과 단계 이름이 같으면 한 번만 보인다', () => {
    renderCard({ mood: { emotion: 'boredom', name: '지루함', stage: 1, stageName: '지루함', value: 51 } })
    expect(screen.getByTestId('card-mood').textContent).toBe('지루함')
  })

  it('감정 막대는 공용 4개 + 구분선 + 개인 감정(개인 표시), 막대마다 문턱 눈금 2개', () => {
    renderCard()
    const bars = screen.getAllByTestId(/^emotion-bar-/)
    expect(bars.map((bar) => bar.dataset.emotion)).toEqual([
      'irritation',
      'excitement',
      'anxiety',
      'boredom',
      'attention',
    ])
    for (const bar of bars) expect(within(bar).getAllByTestId('threshold-tick')).toHaveLength(2)
    expect(screen.getAllByTestId('personal-divider')).toHaveLength(1)
    expect(within(screen.getByTestId('emotion-bar-attention')).getByText('개인')).not.toBeNull()
    expect(within(screen.getByTestId('emotion-bar-irritation')).queryByText('개인')).toBeNull()
    // 2단계를 넘은 막대만 빛난다
    expect(screen.getByTestId('emotion-bar-anxiety').dataset.glow).toBe('true')
    expect(screen.getByTestId('emotion-bar-irritation').dataset.glow).toBe('false')
  })

  it('왜 저러나에 대표 감정의 이유 3개를 +양과 함께', () => {
    renderCard()
    const reasons = screen.getAllByTestId('card-reason')
    expect(reasons.map((row) => row.textContent)).toEqual([
      '무시+20',
      "PD의 '몰아붙이세요'+8",
      "PD의 '앞으로'+3",
    ])
  })

  it('이유가 없으면 "아직 이유 없음"', () => {
    renderCard({ emotions: EMOTIONS.map((item) => ({ ...item, reasons: [] })) })
    expect(screen.queryAllByTestId('card-reason')).toHaveLength(0)
    expect(screen.getByText('아직 이유 없음')).not.toBeNull()
  })

  it('takeover가 있으면 "↪ 이어받는 중 · {text}에 이어 · {올림 초}초"', () => {
    renderCard({
      takeover: { eventId: 4, text: '프리야의 폭소', remainingBodySeconds: 2.2 },
    })
    expect(screen.getByTestId('card-takeover').textContent).toBe(
      '↪ 이어받는 중 · 프리야의 폭소에 이어 · 3초',
    )
  })

  it('takeover가 없으면 이어받기 줄이 없다', () => {
    renderCard()
    expect(screen.queryByTestId('card-takeover')).toBeNull()
  })

  it('이탈했거나 감정이 없으면 감정 칸 없이 이름, 역할, 성향 한 줄', () => {
    for (const actor of [
      { walkedOut: true, mood: null, emotions: [] },
      { emotions: [], mood: null },
    ]) {
      renderCard(actor)
      const card = screen.getByTestId('actor-card')
      expect(card.textContent).toContain(REX.name)
      expect(card.textContent).toContain(REX.role)
      expect(card.textContent).toContain(REX.tendency)
      expect(screen.queryAllByTestId(/^emotion-bar-/)).toHaveLength(0)
      expect(screen.queryByText('아직 이유 없음')).toBeNull()
      expect(screen.queryByTestId('card-takeover')).toBeNull()
      cleanup()
    }
  })
})
