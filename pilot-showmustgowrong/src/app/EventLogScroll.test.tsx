// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TALK_SHOW } from '@/content/talkShow'
import type { LogLine } from '@/sim/engine'
import { EventLog } from './Hud'

function line(index: number): LogLine {
  return {
    index,
    step: 0,
    text: `줄 ${index}`,
    kind: 'incident',
    emotion: null,
    stage: null,
    repeat: 1,
    depth: 1,
    eventId: null,
    lastEventId: null,
    leadIn: null,
    actorId: null,
    x: 0,
    y: 0,
    z: 0,
  }
}

const SCROLL_HEIGHT = 500
const CLIENT_HEIGHT = 100

function logOf(count: number): LogLine[] {
  return Array.from({ length: count }, (_, index) => line(index))
}

/** jsdom에는 레이아웃이 없으므로 스크롤 크기를 대역으로 준다 */
function listWithLayout(): HTMLElement {
  const list = screen.getByTestId('event-log-list')
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: SCROLL_HEIGHT })
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: CLIENT_HEIGHT })
  return list
}

function mount(count: number) {
  return render(<EventLog log={logOf(count)} highlightedEventId={null} show={TALK_SHOW} />)
}

function scrollTo(list: HTMLElement, top: number): void {
  list.scrollTop = top
  fireEvent.scroll(list)
}

describe('EventLog 자동 스크롤', () => {
  afterEach(cleanup)

  it('맨 아래에서 8px 이내면 새 줄이 올 때 맨 아래로 따라간다', () => {
    const view = mount(3)
    const list = listWithLayout()
    scrollTo(list, SCROLL_HEIGHT - CLIENT_HEIGHT - 8)
    view.rerender(<EventLog log={logOf(4)} highlightedEventId={null} show={TALK_SHOW} />)
    expect(list.scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('위로 올려 읽는 중(8px 넘게 떨어짐)이면 새 줄이 와도 위치를 지킨다', () => {
    const view = mount(3)
    const list = listWithLayout()
    scrollTo(list, SCROLL_HEIGHT - CLIENT_HEIGHT - 9)
    view.rerender(<EventLog log={logOf(4)} highlightedEventId={null} show={TALK_SHOW} />)
    expect(list.scrollTop).toBe(SCROLL_HEIGHT - CLIENT_HEIGHT - 9)
  })

  it('마지막 줄의 반복 횟수만 늘어도 맨 아래 근처였다면 따라간다', () => {
    const view = mount(3)
    const list = listWithLayout()
    scrollTo(list, SCROLL_HEIGHT - CLIENT_HEIGHT - 4)
    const repeated = logOf(3)
    repeated[2] = { ...repeated[2], repeat: 2 }
    view.rerender(<EventLog log={repeated} highlightedEventId={null} show={TALK_SHOW} />)
    expect(list.scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('다시 맨 아래로 내리면 따라가기를 다시 시작한다', () => {
    const view = mount(3)
    const list = listWithLayout()
    scrollTo(list, 0)
    scrollTo(list, SCROLL_HEIGHT - CLIENT_HEIGHT)
    view.rerender(<EventLog log={logOf(4)} highlightedEventId={null} show={TALK_SHOW} />)
    expect(list.scrollTop).toBe(SCROLL_HEIGHT)
  })
})
