// @vitest-environment jsdom
import { cleanup, fireEvent, render as mount, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { vi, type MockInstance } from 'vitest'
import { AUTO_SLOWMO_GAUGE_RATIO } from '@/content/balance'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { Broadcast, type BroadcastSetup, type BroadcastView } from '@/sim/engine'
import { AdPanel } from './AdPanel'
import { BroadcastStage, type BroadcastStageProps, type StageControls } from './BroadcastStage'
import { ErrorScreen } from './ErrorScreen'
import { LAYOUT_STORAGE_KEY, type LayoutMode } from './layout'
import { TrendRecorder } from './trendRecorder'
import { ResultScreen } from './ResultScreen'
import type { BroadcastResult } from './useBroadcastLoop'

const HALTED: BroadcastResult = {
  summary: { peakViewers: 612.5, averageViewers: 540, eventCount: 30, maxChainDepth: 3, rootLine: null },
  longestChain: [
    { actorId: 'mo', step: 300, text: '모가 렉스에게 달려든다', depth: 1 },
    { actorId: 'rex', step: 302, text: '렉스가 넘어진다', depth: 2 },
    { actorId: 'rex', step: 305, text: '렉스가 모에게 욕을 퍼붓는다', depth: 3 },
  ],
  haltedBy: 'language',
  interventionsIssued: 2,
}

function noop(): void {}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const NOOP_RESULT_PROPS = { trend: [], show: TALK_SHOW, performers: LINEUP.performers, onRestart: noop }

/** 글자 크기 클래스를 작은 것부터 늘어놓은 순서(클래스에서 크기를 읽어 비교한다) */
const TEXT_SIZES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'] as const

function textSizeRank(element: Element): number {
  const sizes = [...element.classList].flatMap((name) => {
    const match = /^text-(xs|sm|base|lg|xl|[2-6]xl)$/.exec(name)
    return match === null ? [] : [TEXT_SIZES.indexOf(match[1] as (typeof TEXT_SIZES)[number])]
  })
  return sizes.length === 0 ? TEXT_SIZES.indexOf('base') : sizes[0]
}

const ROOTED: BroadcastResult = {
  ...HALTED,
  haltedBy: null,
  summary: { ...HALTED.summary, rootLine: { step: 1100, text: '렉스가 코를 판다' } },
  longestChain: [
    { actorId: 'rex', step: 1100, text: '렉스가 코를 판다', depth: 1 },
    { actorId: 'priya', step: 1500, text: '프리야가 킥킥거린다', depth: 2 },
    { actorId: null, step: 1900, text: '조명이 깜빡인다', depth: 3 },
  ],
}

describe('ResultScreen', () => {
  afterEach(cleanup)

  it('중단 원인 게이지와 다시 하기를 보여 준다', () => {
    mount(<ResultScreen {...NOOP_RESULT_PROPS} result={HALTED} />)
    expect(screen.getByTestId('result-title').textContent).toBe('방송 중단(언어 게이지)')
    expect(screen.getByTestId('restart-button').textContent).toBe('다시 하기')
  })

  it('끝까지 가면 방송 완료와 종료 시각 도장을 보여 준다', () => {
    mount(<ResultScreen {...NOOP_RESULT_PROPS} result={ROOTED} />)
    expect(screen.getByTestId('result-title').textContent).toBe('방송 완료')
    expect(screen.getByTestId('result-end-stamp').textContent).toBe('21:30 종료')
  })

  it('뿌리가 있으면 "모든 건 여기서 시작됐다"와 "{시각} {문장}"이 화면의 모든 글보다 큰 글자다', () => {
    mount(<ResultScreen {...NOOP_RESULT_PROPS} result={ROOTED} />)
    const root = screen.getByTestId('result-root')
    expect(root.textContent).toContain('모든 건 여기서 시작됐다')
    const sentence = screen.getByTestId('result-root-sentence')
    expect(sentence.textContent).toBe('21:03 렉스가 코를 판다')
    const rootRank = textSizeRank(sentence)
    for (const element of document.querySelectorAll('[class*="text-"]')) {
      if (element === sentence) continue
      expect(textSizeRank(element), element.outerHTML.slice(0, 80)).toBeLessThan(rootRank)
    }
  })

  it('뿌리가 없으면 카드 대신 "큰 사고 없이 끝났다"를 보여 주고, 연쇄 칸은 "연쇄 없음"이다', () => {
    mount(
      <ResultScreen
        {...NOOP_RESULT_PROPS}
        result={{ ...HALTED, haltedBy: null, longestChain: [] }}
      />,
    )
    expect(screen.getByTestId('result-calm').textContent).toBe('큰 사고 없이 끝났다')
    expect(screen.queryByTestId('result-root')).toBeNull()
    expect(screen.getByTestId('result-chain-empty').textContent).toBe('연쇄 없음')
    expect(screen.queryByTestId('result-chain')).toBeNull()
    expect(screen.getByTestId('trend-chart')).toBeTruthy()
  })

  it('숫자 4개: 최고 시청자, 평균 시청자, 최대 연쇄 깊이, 개입', () => {
    mount(<ResultScreen {...NOOP_RESULT_PROPS} result={HALTED} />)
    const stats = screen.getByTestId('result-stats')
    expect(stats.querySelectorAll('dt')).toHaveLength(4)
    expect(stats.textContent).toContain('최고 시청자612,500명')
    expect(stats.textContent).toContain('평균 시청자540,000명')
    expect(stats.textContent).toContain('최대 연쇄 깊이3단계')
    expect(stats.textContent).toContain('개입2회')
  })

  it('연쇄 줄은 화살표로 이어지고 첫 줄 "뿌리", 마지막 줄 "가장 큰 터짐", 점 색은 주인공 색, 없으면 회색', () => {
    mount(<ResultScreen {...NOOP_RESULT_PROPS} result={ROOTED} />)
    const items = screen.getAllByTestId('result-chain-line')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('21:03')
    expect(items[0].textContent).toContain('렉스가 코를 판다')
    expect(items[0].textContent).toContain('뿌리')
    expect(items[0].textContent).not.toContain('가장 큰 터짐')
    expect(items[1].textContent).not.toMatch(/뿌리|가장 큰 터짐/)
    expect(items[2].textContent).toContain('가장 큰 터짐')
    const dotColors = items.map((item) => item.querySelector<HTMLElement>('[data-testid="result-chain-dot"]')?.style.backgroundColor)
    expect(dotColors).toEqual(['rgb(239, 68, 68)', 'rgb(168, 85, 247)', 'rgb(148, 163, 184)'])
    expect(screen.getAllByTestId('result-chain-arrow')).toHaveLength(2)
  })

  it('연쇄가 한 줄뿐이면 그 줄에 "뿌리"와 "가장 큰 터짐"이 둘 다 붙는다', () => {
    mount(
      <ResultScreen
        {...NOOP_RESULT_PROPS}
        result={{ ...ROOTED, longestChain: [ROOTED.longestChain[0]] }}
      />,
    )
    const only = screen.getByTestId('result-chain-line')
    expect(only.textContent).toContain('뿌리')
    expect(only.textContent).toContain('가장 큰 터짐')
    expect(screen.queryAllByTestId('result-chain-arrow')).toHaveLength(0)
  })

  it('긴 연쇄도 모든 줄을 칸 안에서 스크롤로 보여 준다', () => {
    const lines = Array.from({ length: 17 }, (_, index) => ({
      actorId: null,
      step: 300 + index,
      text: `연쇄 문장 ${index + 1}번`,
      depth: index + 1,
    }))
    mount(<ResultScreen {...NOOP_RESULT_PROPS} result={{ ...ROOTED, longestChain: lines }} />)
    expect(screen.getAllByTestId('result-chain-line')).toHaveLength(17)
    expect(screen.getByTestId('result-chain').className).toContain('overflow-y-auto')
  })

  it('긴 문장은 한 줄로 고정(truncate)하고 전체 문장은 title로 보여 준다', () => {
    const longText = '렉스가 방송 내내 참았던 분노를 터뜨리며 스튜디오 한가운데에서 소리를 지르기 시작한다'
    mount(
      <ResultScreen
        {...NOOP_RESULT_PROPS}
        result={{ ...ROOTED, longestChain: [{ actorId: null, step: 300, text: longText, depth: 1 }] }}
      />,
    )
    const text = screen.getByTestId('result-chain-text')
    expect(text.className).toContain('truncate')
    expect(text.getAttribute('title')).toBe(longText)
  })

  it('뿌리 문장은 길어도 말줄임 없이 줄바꿈으로 전부 보여 주고 가장 큰 글자를 유지한다', () => {
    const longRoot =
      '프리야의 킥킥거림을 참던 오카포가 무너지는 세트 벽에게 "정확한 표현이 아닙니다" 하고 끼어든다'
    mount(
      <ResultScreen
        {...NOOP_RESULT_PROPS}
        result={{ ...ROOTED, summary: { ...ROOTED.summary, rootLine: { step: 1100, text: longRoot } } }}
      />,
    )
    const sentence = screen.getByTestId('result-root-sentence')
    expect(sentence.textContent).toBe(`21:03 ${longRoot}`)
    expect(sentence.className).not.toMatch(/truncate|line-clamp|text-ellipsis/)
    expect(textSizeRank(sentence)).toBeGreaterThan(textSizeRank(screen.getByTestId('result-title')))
  })

  it('터짐 추세는 clock 축으로 방송 전체(21:00부터 21:30)를 그린다', () => {
    const trend = [{ actorId: 'rex', points: [{ step: 0, value: 10 }, { step: 30, value: 20 }] }]
    mount(<ResultScreen {...NOOP_RESULT_PROPS} trend={trend} result={ROOTED} />)
    const chart = screen.getByTestId('trend-chart')
    expect(chart.textContent).toContain('21:00')
    expect(chart.textContent).toContain('21:30')
    expect(chart.textContent).not.toContain('지금')
    expect(chart.querySelector('[data-trend-line="rex"]')).not.toBeNull()
  })

  it('다시 하기를 누르면 onRestart를 부른다', () => {
    const onRestart = vi.fn()
    mount(<ResultScreen {...NOOP_RESULT_PROPS} onRestart={onRestart} result={HALTED} />)
    fireEvent.click(screen.getByTestId('restart-button'))
    expect(onRestart).toHaveBeenCalledTimes(1)
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
        trend={new TrendRecorder([])}
        selectedTarget={null}
        hoverTip={null}
        actorCard={null}
        onSelectTarget={noop}
        onDirect={noop}
        onBeginIntervention={noop}
        onLayoutChanged={noop}
        {...overrides}
      />,
    )
  }

  function count(html: string, pattern: RegExp): number {
    return (html.match(pattern) ?? []).length
  }

  it('게이지 4개, 시청자 수, 남은 시간, 코너, ON AIR 이름표, 카메라 칸 3개, 개입·광고 버튼이 있다', () => {
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
    expect(html).toMatch(/data-testid="on-air-label"[^>]*>[^<]*카메라 2 클로즈업 · 대상 렉스/)
    expect(count(html, /data-testid="camera-preview"/g)).toBe(3)
    expect(html).toContain('data-testid="intervene-button"')
    expect(html).toContain('data-testid="ad-button"')
    expect(html).toContain('data-testid="event-log"')
  })

  it('지시로 고정된 클로즈업은 ON AIR와 미리보기 이름표에 고정과 되돌리는 법을 쓴다', () => {
    const directed: BroadcastView = {
      ...baseView,
      cameraTargets: { ...baseView.cameraTargets, close: 'rex' },
      cameraAimModes: { ...baseView.cameraAimModes, close: 'directed' },
    }
    const label = '대상 렉스 · 지시로 고정 (카메라를 출연자에게 끌면 추적)'
    const onAir = render({ view: { ...directed, onAirCameraId: 'close' } })
    expect(onAir).toMatch(
      new RegExp(`data-testid="on-air-label"[^>]*>[^<]*카메라 2 클로즈업 · ${escapeRegExp(label)}`),
    )
    expect(onAir).toMatch(/data-testid="on-air-label" data-aim-mode="directed"/)

    const preview = render({ view: { ...directed, onAirCameraId: 'wide' } })
    expect(preview).toMatch(
      new RegExp(`data-testid="preview-target"[^>]*>${escapeRegExp(label)}<`),
    )

    const tracking = render({
      view: {
        ...directed,
        onAirCameraId: 'close',
        cameraAimModes: { ...directed.cameraAimModes, close: 'tracking' },
      },
    })
    expect(tracking).toMatch(/data-testid="on-air-label"[^>]*>[^<]*카메라 2 클로즈업 · 대상 렉스</)
    expect(tracking).not.toContain('지시로 고정')
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

  it('판단 카드에 대상 탭(출연자 색), 지시 카드마다 번호·이름·예상·칩, 엇나갈 확률이 보인다', () => {
    const html = render({
      controls: { ...CONTROLS, slowmo: 'intervention', interventionOpen: true },
      selectedTarget: { kind: 'performer', id: 'okafor' },
    })
    expect(html).toMatch(/data-testid="target-rex"[^>]*style="[^"]*color:#EF4444/)
    expect(html).toMatch(/data-testid="target-okafor"[^>]*style="[^"]*color:#14B8A6/)
    expect(html).toContain('1.')
    expect(html).toContain('진정하세요')
    expect(html).toContain('짜증 ▼ 크게')
    expect(html).toContain('data-testid="emotion-bar-irritation"')
    expect(html).toContain('data-testid="misfire-chance"')
    expect(html).toContain('data-testid="directive-chip"')
  })

  it('카메라 감독 카드는 감정 막대 없이 지시만 보인다', () => {
    const html = render({
      controls: { ...CONTROLS, slowmo: 'intervention', interventionOpen: true },
      selectedTarget: { kind: 'staff', id: 'cameraOperator' },
    })
    expect(html).toContain('data-testid="target-card"')
    expect(html).not.toContain('data-testid="emotion-bar-')
    expect(html).not.toContain('data-testid="directive-chip"')
  })

  it('개입 중 광고 버튼은 disabled, 개입 버튼은 "개입 닫기"와 Esc', () => {
    const html = render({
      controls: { ...CONTROLS, slowmo: 'intervention', interventionOpen: true },
    })
    expect(html).toMatch(/<button[^>]*data-testid="ad-button"[^>]*disabled/)
    expect(html).toMatch(/data-testid="intervene-button"[\s\S]*?개입 닫기[\s\S]*?Esc/)
  })

  it('개입 중에는 위 띠와 오른쪽 열이 흐려지고 닫으면 필터가 없다', () => {
    const open = render({ controls: { ...CONTROLS, slowmo: 'intervention', interventionOpen: true } })
    const filter = 'filter:brightness(0.6) saturate(0.6)'
    expect(count(open, /filter:brightness\(0\.6\) saturate\(0\.6\)/g)).toBe(4)
    expect(open).toMatch(new RegExp(`<div class="shrink-0" style="${filter.replace(/[()]/g, '\\$&')}"><header data-testid="top-band"`))
    expect(open).toMatch(/<section data-testid="program-monitor"[^>]*filter:brightness/)
    expect(open).toMatch(/<div data-testid="switcher-slots"[^>]*filter:brightness/)
    expect(render()).not.toContain('brightness')
  })

  it('ON AIR 모니터는 버튼이 아니고, 카메라 칸 3개는 송출 중인 칸만 표시가 다르다', () => {
    const html = render()
    expect(html).toMatch(/<section[^>]*data-testid="program-monitor"[^>]*data-on-air="true"/)
    expect(count(html, /<button[^>]*data-testid="switcher-slot-/g)).toBe(3)
    expect(count(html, /<button[^>]*data-on-air="false"/g)).toBe(2)
    expect(html).toMatch(/<button[^>]*data-testid="switcher-slot-wide"[^>]*data-on-air="true"/)
  })

  it('스태프 카드는 콘텐츠의 역할과 담당 카메라를 보여 준다', () => {
    const html = render({
      controls: { ...CONTROLS, slowmo: 'intervention', interventionOpen: true },
      selectedTarget: { kind: 'staff', id: 'cameraOperator' },
    })
    const operator = LINEUP.staff[0]
    expect(html).toContain('담당 카메라 2 클로즈업')
    expect(html).toContain(operator.role)
    expect(html).toContain(operator.tendency)
    for (const directive of operator.directives) expect(html).toContain(directive.expect)
  })

  it('광고 중 화면은 한국어로 알리고 영어 문구가 없다', () => {
    const html = render({ controls: { ...CONTROLS, adBreak: true, adBreakSecondsLeft: 4.2 } })
    expect(html).toMatch(/data-testid="commercial-break"/)
    expect(html).toContain('광고 중')
    expect(html).toContain('5초 뒤 방송으로 돌아갑니다')
    expect(html).not.toContain('COMMERCIAL')
  })

  it('개입 중에 연 광고 패널이면 배지가 광고 효과 선택 시간을 말한다', () => {
    const intervening = { ...CONTROLS, slowmo: 'intervention' as const }
    expect(render({ controls: { ...intervening, interventionOpen: true } })).toContain('안에 지시')
    const adHtml = render({
      controls: { ...intervening, adPanelOpen: true, adPanelSecondsLeft: 4.2 },
    })
    expect(adHtml).toContain('안에 광고 효과 선택')
    expect(adHtml).not.toContain('안에 지시')
  })
  describe('배치 전환', () => {
    let getContextSpy: MockInstance<HTMLCanvasElement['getContext']>

    beforeAll(() => {
      // 캔버스 2D 컨텍스트가 없는 jsdom에서도 카메라 화면 그리기를 건너뛰게 한다.
      getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    })
    afterEach(() => {
      cleanup()
      localStorage.clear()
    })
    afterAll(() => getContextSpy.mockRestore())

    function mountStage(onLayoutChanged: (mode: LayoutMode) => void = noop) {
      return mount(
        <BroadcastStage
          view={baseView}
          setup={SETUP}
          controls={CONTROLS}
          trend={new TrendRecorder([])}
          selectedTarget={null}
          hoverTip={null}
          actorCard={null}
          onSelectTarget={noop}
          onDirect={noop}
          onBeginIntervention={noop}
          onLayoutChanged={onLayoutChanged}
        />,
      )
    }

    const layout = () => screen.getByRole('main').dataset.layout
    const pressL = (init: KeyboardEventInit = {}) =>
      fireEvent.keyDown(window, { key: 'l', code: 'KeyL', ...init })

    it('L을 누르면 data-layout이 default→studio→onair→default로 바뀌고 저장된다', () => {
      mountStage()
      expect(layout()).toBe('default')
      pressL()
      expect(layout()).toBe('studio')
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('studio')
      // Shift+L(대문자)도 받는다
      pressL({ key: 'L', shiftKey: true })
      expect(layout()).toBe('onair')
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('onair')
      // 한글 자판에서는 같은 자리 키가 'ㅣ'라 자리(code)로 받는다
      pressL({ key: 'ㅣ' })
      expect(layout()).toBe('default')
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('default')
    })

    it('L이나 배치 버튼으로 배치를 바꾸면 onLayoutChanged로 새 배치를 알린다(컨테이너가 카드를 닫는다)', () => {
      const onLayoutChanged = vi.fn()
      mountStage(onLayoutChanged)
      pressL()
      expect(onLayoutChanged).toHaveBeenLastCalledWith('studio')
      fireEvent.click(screen.getByRole('button', { name: '송출 화면 크게' }))
      expect(onLayoutChanged).toHaveBeenLastCalledWith('onair')
      expect(onLayoutChanged).toHaveBeenCalledTimes(2)
      // 무시되는 L(입력 조합키)은 알리지 않는다
      pressL({ ctrlKey: true })
      expect(onLayoutChanged).toHaveBeenCalledTimes(2)
    })

    it('입력 칸에서 L은 무시된다', () => {
      mountStage()
      const input = document.createElement('input')
      document.body.append(input)
      fireEvent.keyDown(input, { key: 'l', code: 'KeyL' })
      expect(layout()).toBe('default')
      input.remove()
    })

    it('Ctrl·Meta·Alt와 함께 누른 L과 반복 입력은 무시된다', () => {
      mountStage()
      pressL({ ctrlKey: true })
      pressL({ metaKey: true })
      pressL({ altKey: true })
      pressL({ repeat: true })
      expect(layout()).toBe('default')
    })

    it('저장된 배치로 열고, 깨진 저장값이면 기본으로 연다', () => {
      localStorage.setItem(LAYOUT_STORAGE_KEY, 'onair')
      mountStage()
      expect(layout()).toBe('onair')
      cleanup()
      localStorage.setItem(LAYOUT_STORAGE_KEY, '{broken')
      mountStage()
      expect(layout()).toBe('default')
    })

    it('열기만 해서는 저장소에 쓰지 않고, 배치를 바꿀 때만 저장한다', () => {
      mountStage()
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()
      cleanup()
      localStorage.setItem(LAYOUT_STORAGE_KEY, '{broken')
      mountStage()
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('{broken')
      pressL()
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('studio')
    })

    it('위 띠의 배치 버튼 3개는 그 배치로 바로 가고 현재 배치만 눌림 상태다', () => {
      mountStage()
      const button = (name: string) => screen.getByRole('button', { name })
      expect(button('기본').getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(button('송출 화면 크게'))
      expect(layout()).toBe('onair')
      expect(button('송출 화면 크게').getAttribute('aria-pressed')).toBe('true')
      expect(button('기본').getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(button('스튜디오 크게'))
      expect(layout()).toBe('studio')
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('studio')
    })

    it('배치를 바꿔도 studio-host와 program-monitor 요소가 같은 DOM 노드로 남는다', () => {
      mountStage()
      const host = screen.getByTestId('studio-host')
      const monitor = screen.getByTestId('program-monitor')
      const canvases = Array.from(document.querySelectorAll('canvas'))
      expect(canvases).toHaveLength(4)
      const slotOrder = () =>
        Array.from(screen.getByTestId('switcher-slots').children).map((slot) =>
          slot.getAttribute('data-testid'),
        )
      const slots = slotOrder()
      for (let index = 0; index < 3; index += 1) {
        pressL()
        expect(screen.getByTestId('studio-host')).toBe(host)
        expect(screen.getByTestId('program-monitor')).toBe(monitor)
        expect(Array.from(document.querySelectorAll('canvas'))).toEqual(canvases)
        expect(slotOrder()).toEqual(slots)
      }
      expect(layout()).toBe('default')
    })
  })
})
