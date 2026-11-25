import { renderToStaticMarkup } from 'react-dom/server'
import { AUTO_SLOWMO_GAUGE_RATIO } from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastSetup, type BroadcastView } from '@/sim/engine'
import { AdPanel } from './AdPanel'
import { BroadcastStage, type BroadcastStageProps, type StageControls } from './BroadcastScreen'
import { ErrorScreen } from './ErrorScreen'
import {
  CHAIN_INDENT_MAX_LEVEL,
  CHAIN_INDENT_PX,
  CHAIN_LINES_SHOWN,
  ResultScreen,
} from './ResultScreen'
import type { BroadcastResult } from './useBroadcastLoop'

const HALTED: BroadcastResult = {
  summary: { peakViewers: 612.5, averageViewers: 540, eventCount: 30, maxChainDepth: 3 },
  longestChain: [
    { step: 300, text: '모가 렉스에게 달려든다', depth: 1 },
    { step: 302, text: '렉스가 넘어진다', depth: 2 },
    { step: 305, text: '렉스가 모에게 욕을 퍼붓는다', depth: 3 },
  ],
  haltedBy: 'language',
  interventionsIssued: 2,
}

function noop(): void {}

describe('ResultScreen', () => {
  it('중단 원인 게이지, 시청자, 최대 연쇄와 그 문장들, 다시 하기를 보여 준다', () => {
    const html = renderToStaticMarkup(<ResultScreen result={HALTED} onRestart={noop} />)
    expect(html).toContain('방송 중단(언어 게이지)')
    expect(html).toContain('612,500명')
    expect(html).toContain('540,000명')
    expect(html).toContain('3단계')
    expect(html).toContain('2회')
    for (const line of HALTED.longestChain) expect(html).toContain(line.text)
    expect(html).toContain('다시 하기')
  })

  it('끝까지 가면 방송 완료, 연쇄가 없으면 그렇게 쓴다', () => {
    const html = renderToStaticMarkup(
      <ResultScreen
        result={{ ...HALTED, haltedBy: null, longestChain: [] }}
        onRestart={noop}
      />,
    )
    expect(html).toContain('방송 완료')
    expect(html).toContain('이어진 사고가 없었습니다.')
  })
})

describe('ResultScreen 긴 연쇄', () => {
  const CHAIN_LENGTH = CHAIN_LINES_SHOWN + 7
  const LONG: BroadcastResult = {
    ...HALTED,
    summary: { ...HALTED.summary, maxChainDepth: CHAIN_LENGTH },
    longestChain: Array.from({ length: CHAIN_LENGTH }, (_, index) => ({
      step: 300 + index,
      text: `연쇄 문장 ${index + 1}번`,
      depth: index + 1,
    })),
  }

  it('표시 줄 수 상한까지만 보여 주고 나머지는 "… 외 N단계"로 줄인다', () => {
    const html = renderToStaticMarkup(<ResultScreen result={LONG} onRestart={noop} />)
    const items = html.match(/<li/g) ?? []
    expect(items).toHaveLength(CHAIN_LINES_SHOWN + 1)
    expect(html).toContain(`연쇄 문장 ${CHAIN_LINES_SHOWN}번`)
    expect(html).not.toContain(`연쇄 문장 ${CHAIN_LINES_SHOWN + 1}번`)
    expect(html).toContain(`… 외 ${CHAIN_LENGTH - CHAIN_LINES_SHOWN}단계`)
  })

  it('들여쓰기는 상한 단계에서 멈춘다', () => {
    const html = renderToStaticMarkup(<ResultScreen result={LONG} onRestart={noop} />)
    const indents = [...html.matchAll(/padding-left:(\d+)px/g)].map((match) => Number(match[1]))
    expect(indents.length).toBeGreaterThan(0)
    expect(Math.max(...indents)).toBe(CHAIN_INDENT_MAX_LEVEL * CHAIN_INDENT_PX)
  })

  it('상한 이하의 연쇄는 줄이지 않는다', () => {
    const html = renderToStaticMarkup(<ResultScreen result={HALTED} onRestart={noop} />)
    expect(html).not.toContain('… 외')
  })
})

describe('ResultScreen 긴 문장', () => {
  const LONG_TEXT = '렉스가 방송 내내 참았던 분노를 터뜨리며 스튜디오 한가운데에서 소리를 지르기 시작한다'

  it('연쇄 줄은 한 줄로 고정(truncate)하고 전체 문장은 title로 보여 준다', () => {
    const html = renderToStaticMarkup(
      <ResultScreen
        result={{ ...HALTED, longestChain: [{ step: 300, text: LONG_TEXT, depth: 1 }] }}
        onRestart={noop}
      />,
    )
    expect(html).toMatch(/<span class="[^"]*\btruncate\b[^"]*"[^>]*>/)
    expect(html).toMatch(/\btruncate\b[^>]*title="/)
    expect(html).toContain(`title="${LONG_TEXT}"`)
  })
})

describe('AdPanel 남은 시간', () => {
  it('개입 중에 연 패널(secondsLeft 있음)만 남은 초를 보여 준다', () => {
    const open = renderToStaticMarkup(
      <AdPanel benchLeft={1} secondsLeft={2.34} onConfirm={noop} onCancel={noop} />,
    )
    expect(open).toContain('data-testid="ad-seconds"')
    expect(open).toContain('2.3초')
    const normal = renderToStaticMarkup(
      <AdPanel benchLeft={1} secondsLeft={null} onConfirm={noop} onCancel={noop} />,
    )
    expect(normal).not.toContain('ad-seconds')
  })
})

describe('ErrorScreen', () => {
  it('시작 실패와 방송 중 오류의 제목이 다르고, 메시지와 새로고침 안내를 보여 준다', () => {
    const create = renderToStaticMarkup(<ErrorScreen kind="create" message="wasm 로드 실패" />)
    expect(create).toContain('방송을 시작할 수 없습니다')
    expect(create).toContain('wasm 로드 실패')
    expect(create).toContain('새로고침해 주세요')

    const runtime = renderToStaticMarkup(<ErrorScreen kind="runtime" message="무대에 없는 출연자" />)
    expect(runtime).toContain('방송 중 오류가 났습니다')
    expect(runtime).not.toContain('방송을 시작할 수 없습니다')
    expect(runtime).toContain('새로고침해 주세요')
  })
})

describe('BroadcastStage 생방송 화면', () => {
  const SETUP: BroadcastSetup = { show: TALK_SHOW, ...LINEUP, seed: 1 }
  let baseView: BroadcastView

  beforeAll(async () => {
    const broadcast = await Broadcast.create(SETUP)
    baseView = broadcast.view()
    broadcast.dispose()
  })

  const CONTROLS: StageControls = {
    slowmo: 'none',
    interventionOpen: false,
    interventionSecondsLeft: 0,
    adPanelOpen: false,
    adPanelSecondsLeft: null,
    adBreak: false,
    adBreakSecondsLeft: 0,
    send: noop,
    openIntervention: noop,
    closeIntervention: noop,
    startAd: noop,
    cancelAd: noop,
    endAd: noop,
  }

  function render(overrides: Partial<BroadcastStageProps> = {}): string {
    return renderToStaticMarkup(
      <BroadcastStage
        view={baseView}
        setup={SETUP}
        controls={CONTROLS}
        selectedTarget={null}
        hoverTip={null}
        onSelectTarget={noop}
        onDirect={noop}
        onBeginIntervention={noop}
        {...overrides}
      />,
    )
  }

  function count(html: string, pattern: RegExp): number {
    return (html.match(pattern) ?? []).length
  }

  it('게이지 4개, 시청자 수, 남은 시간, 코너, ON AIR 이름표, 미리보기 2개, 개입·광고 버튼이 있다', () => {
    const view: BroadcastView = {
      ...baseView,
      onAirCameraId: 'close',
      cameraTargets: { ...baseView.cameraTargets, close: 'rex' },
    }
    const html = render({ view })
    for (const gauge of ['sexual', 'violence', 'drugs', 'language']) {
      expect(html).toContain(`data-testid="gauge-${gauge}"`)
    }
    expect(html).toContain('data-testid="viewers"')
    expect(html).toContain('data-testid="viewers-trend"')
    expect(html).toContain('data-testid="broadcast-time"')
    expect(html).toMatch(/data-testid="corner"[^>]*>[^<]*오프닝 1\/3/)
    expect(html).toMatch(/data-testid="on-air-label"[^>]*>[^<]*CAM 2 클로즈업 · 대상 렉스/)
    expect(count(html, /data-testid="camera-preview"/g)).toBe(2)
    expect(html).toContain('data-testid="intervene-button"')
    expect(html).toContain('data-testid="ad-button"')
    expect(html).toContain('data-testid="event-log"')
  })

  it('상한의 80%를 넘은 게이지에만 강조 표시가 있다', () => {
    const limit = baseView.limits.language
    const view: BroadcastView = {
      ...baseView,
      gauges: { ...baseView.gauges, language: limit * (AUTO_SLOWMO_GAUGE_RATIO + 0.05) },
    }
    const html = render({ view })
    expect(count(html, /data-highlighted="true"/g)).toBe(1)
    expect(html).toMatch(/data-testid="gauge-language"[^>]*data-highlighted="true"/)
    expect(render()).not.toContain('data-highlighted="true"')
  })

  it('개입 중에 대상을 고르면 로그 자리에 대상 카드가 뜨고 엇나감 확률은 한 번만 나온다', () => {
    const view: BroadcastView = {
      ...baseView,
      actors: baseView.actors.map((actor) =>
        actor.id === 'rex' ? { ...actor, misfireChance: 0.3 } : actor,
      ),
    }
    const html = render({
      view,
      controls: {
        ...CONTROLS,
        slowmo: 'intervention',
        interventionOpen: true,
        interventionSecondsLeft: 8.64,
      },
      selectedTarget: { kind: 'performer', id: 'rex' },
    })
    expect(html).toContain('data-testid="target-card"')
    expect(html).not.toContain('data-testid="event-log"')
    expect(count(html, /data-testid="misfire-chance"/g)).toBe(1)
    expect(count(html, /30%/g)).toBe(1)
    expect(html).toContain('SLOW ×1/5')
    expect(html).toContain('8.6')
    expect(html).toContain('내성 1 소모 · 누적 피로 +1')
  })
})
