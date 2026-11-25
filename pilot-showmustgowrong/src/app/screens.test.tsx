import { renderToStaticMarkup } from 'react-dom/server'
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
