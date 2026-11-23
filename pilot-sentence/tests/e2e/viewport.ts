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
