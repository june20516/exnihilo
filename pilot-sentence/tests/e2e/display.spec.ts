import { expect, type Locator, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

const fontOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).fontFamily)

test.beforeEach(async ({ page }) => {
  await page.goto('/?mode=rally&seed=5')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('end-turn')).toBeVisible()
})

test('폰트 토큰: 카드 단어는 Song Myung, 버튼은 Pretendard, 계산식 결과는 Do Hyeon', async ({ page }) => {
  expect(await fontOf(page.getByTestId('tile-bite').first().locator('[data-word-text]'))).toContain('Song Myung')
  expect(await fontOf(page.getByTestId('end-turn'))).toContain('Pretendard')
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  expect(await fontOf(page.getByTestId('formula-result').first())).toContain('Do Hyeon')
})

test('툴팁: 서고 숫자에 마우스를 올리면 tooltip이 화면 안에 뜬다', async ({ page }) => {
  await page.getByTestId('pile-draw').hover()
  await expect(page.getByTestId('tooltip')).toBeInViewport()
})
