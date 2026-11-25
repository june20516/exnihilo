import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorScreen } from './ErrorScreen'
import { ResultScreen } from './ResultScreen'
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
