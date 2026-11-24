import { expect, type Page } from '@playwright/test'

/**
 * 한 화면 검사: 핵심 요소가 뷰포트 안에 완전히 들어와 있는가.
 * 루트가 h-screen overflow-hidden이라 넘쳐도 문서 스크롤은 생기지 않고 잘리기만 하므로, scrollHeight 대신 요소 위치를 본다.
 */
export async function expectInViewport(page: Page, testIds: readonly string[]) {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('뷰포트 크기를 알 수 없습니다.')
  for (const id of testIds) {
    const box = await page.getByTestId(id).last().boundingBox()
    expect(box, `${id}가 보이지 않습니다`).not.toBeNull()
    if (!box) continue
    expect(box.y, `${id} 위쪽이 화면 밖`).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height, `${id} 아래쪽이 화면 밖`).toBeLessThanOrEqual(viewport.height)
    expect(box.x + box.width, `${id} 오른쪽이 화면 밖`).toBeLessThanOrEqual(viewport.width)
  }
}

/** 겹침 검사: 위 요소의 아래쪽이 아래 요소의 위쪽을 넘지 않는다(눌려서 겹치는 배치를 잡는다). */
export async function expectStacked(page: Page, upperId: string, lowerId: string) {
  const upper = await page.getByTestId(upperId).first().boundingBox()
  const lower = await page.getByTestId(lowerId).first().boundingBox()
  expect(upper && lower, `${upperId}·${lowerId}가 보이지 않습니다`).toBeTruthy()
  if (!upper || !lower) return
  expect(upper.y + upper.height, `${upperId}가 ${lowerId}와 겹칩니다`).toBeLessThanOrEqual(lower.y + 1)
}


/** 내용 넘침 검사: 영역 안의 내용이 영역 밖으로 넘치지 않는가(눌린 영역에서 위아래로 삐져나오는 배치를 잡는다). */
export async function expectContentFits(page: Page, testId: string) {
  const overflow = await page.getByTestId(testId).first().evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(overflow, `${testId} 내용이 ${overflow}px 넘칩니다`).toBeLessThanOrEqual(1)
}
