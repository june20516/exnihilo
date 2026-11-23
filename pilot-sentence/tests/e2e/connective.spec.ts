import { expect, type Page, test } from '@playwright/test'
import { expectInViewport } from './viewport.js'

test.use({ viewport: { width: 1440, height: 900 } })

/** 샌드박스에서 덱에 그리고를 4장 넣고, 손패에 올 때까지 턴을 넘긴다(최대 6번). */
async function handWithConnective(page: Page) {
  await page.goto('/?mode=rally&seed=5')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await page.getByTestId('open-deck').click()
  for (let i = 0; i < 4; i++) await page.getByTestId('plus-and').click()
  await page.getByTestId('deck-save').click()
  for (let turn = 0; turn < 6; turn++) {
    if ((await page.getByTestId('tile-and').count()) > 0) return
    await page.getByTestId('end-turn').click()
    await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 10_000 })
  }
  await expect(page.getByTestId('tile-and').first()).toBeVisible()
}

test('연결어를 연결어 칸에 놓으면 둘째 절이 열리고, 한 화면에 들어간다', async ({ page }) => {
  await handWithConnective(page)
  await expect(page.locator('[data-testid="sentence"] [data-clause="1"]')).toHaveCount(0)
  await page.getByTestId('tile-and').first().click()
  await page.getByTestId('connective-slot').click()
  await expect(page.getByTestId('connective-slot')).toContainText('그리고')
  await expect(page.locator('[data-testid="sentence"] [data-clause="1"]')).toBeVisible()
  await expectInViewport(page, ['cast', 'end-turn', 'clear', 'hand', 'formula'])
})

test('두 절에 동사를 놓으면 계산식이 절마다 한 줄씩 보인다', async ({ page }) => {
  await handWithConnective(page)
  await page.getByTestId('tile-and').first().click()
  await page.getByTestId('connective-slot').click()
  // 수치 계산식이 나오는 동사(피해·보호·회복)
  const verbs = page.getByTestId('hand').locator(['bite', 'slash', 'guard', 'hide', 'mend'].map((id) => `[data-testid="tile-${id}"]`).join(', '))
  expect(await verbs.count()).toBeGreaterThanOrEqual(2)
  await verbs.nth(0).click()
  await page.getByTestId('slot-0-verb').click()
  await verbs.nth(0).click()
  await page.getByTestId('slot-1-verb').click()
  await expect(page.locator('[data-testid="formula"] [data-clause="0"]')).toBeVisible()
  await expect(page.locator('[data-testid="formula"] [data-clause="1"]')).toBeVisible()
})

test('문장 비우기는 연결어와 둘째 절까지 손패로 돌려보낸다', async ({ page }) => {
  await handWithConnective(page)
  const tiles = page.getByTestId('hand').locator('[data-instance-id]')
  const before = await tiles.count()
  await page.getByTestId('tile-and').first().click()
  await page.getByTestId('connective-slot').click()
  await expect(tiles).toHaveCount(before - 1)
  await expect(page.getByTestId('clear')).toBeEnabled()
  await page.getByTestId('clear').click()
  await expect(tiles).toHaveCount(before)
  await expect(page.locator('[data-testid="sentence"] [data-clause="1"]')).toHaveCount(0)
})

test('차 있는 연결어 칸을 누르면 연결어가 손패로 돌아온다', async ({ page }) => {
  await handWithConnective(page)
  await page.getByTestId('tile-and').first().click()
  await page.getByTestId('connective-slot').click()
  await page.getByTestId('connective-slot').click()
  await expect(page.locator('[data-testid="sentence"] [data-clause="1"]')).toHaveCount(0)
})
