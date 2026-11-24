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

test('손패 겹침: 이웃과 겹쳐 놓이고, 마우스를 올린 카드는 중심에서 자기 자신이 맨 위다', async ({ page }) => {
  const tiles = page.getByTestId('hand').locator('[data-instance-id]:not([data-instance-id="basic"])')
  await expect(tiles).toHaveCount(6)
  const a = await tiles.nth(1).boundingBox()
  const b = await tiles.nth(2).boundingBox()
  if (!a || !b) throw new Error('카드 위치를 찾을 수 없습니다.')
  expect(a.x + a.width).toBeGreaterThan(b.x)
  await tiles.nth(1).hover()
  const box = await tiles.nth(1).boundingBox()
  if (!box) throw new Error('카드 위치를 찾을 수 없습니다.')
  const topId = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-instance-id]')?.getAttribute('data-instance-id') ?? null, [box.x + box.width / 2, box.y + box.height / 2])
  expect(topId).toBe(await tiles.nth(1).getAttribute('data-instance-id'))
})

test('놓은 단어를 누르면 손패로 돌아온다(고른 카드가 없을 때)', async ({ page }) => {
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('slot-0-verb')).toContainText('물어뜯는다')
  // 배치 연출이 끝나야 입력을 받는다.
  await expect(page.getByTestId('end-turn')).toBeEnabled()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('slot-0-verb')).not.toContainText('물어뜯는다')
  await expect(page.getByTestId('tile-bite').first()).toBeVisible()
})

test('고른 카드가 있을 때 칸을 누르면 바꿔 놓는다', async ({ page }) => {
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  await page.getByTestId('tile-guard').first().click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('slot-0-verb')).toContainText('막는다')
})

test('놓은 단어를 판 밖으로 끌면 손패로 돌아온다', async ({ page }) => {
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('end-turn')).toBeEnabled()
  const from = await page.getByTestId('slot-0-verb').boundingBox()
  const to = await page.getByTestId('hand').boundingBox()
  if (!from || !to) throw new Error('위치를 찾을 수 없습니다.')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 })
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 15 })
  await page.mouse.up()
  await expect(page.getByTestId('slot-0-verb')).not.toContainText('물어뜯는다')
})

test('서고 툴팁은 단어별 장수를, 망각 툴팁은 버린 순서를 보인다', async ({ page }) => {
  await page.getByTestId('pile-draw').hover()
  await expect(page.getByTestId('tooltip')).toContainText('×')
  await page.getByTestId('discard').click()
  const tiles = page.getByTestId('hand').locator('[data-instance-id]:not([data-instance-id="basic"])')
  const firstText = await tiles.nth(0).locator('[data-word-text]').innerText()
  await tiles.nth(0).click()
  await page.getByTestId('discard-confirm').click()
  await page.getByTestId('pile-discard').hover()
  await expect(page.getByTestId('tooltip')).toContainText(firstText)
})

test('상태 배지에 마우스를 올리면 이름·뜻이 툴팁으로 뜬다', async ({ page }) => {
  // 낭독 전에도 이번 낭독으로 남을 상태가 미리 보인다.
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  await page.getByTestId('tile-cracked').first().click()
  await page.getByTestId('mod-0-object-0').click()
  await expect(page.getByTestId('states-e0')).toBeVisible()
  await page.getByTestId('states-e0').locator('[data-state]').first().hover()
  await expect(page.getByTestId('tooltip')).toContainText('받는 피해')
})

test('카드에 마우스를 올리면 설명 툴팁이 뜬다', async ({ page }) => {
  await page.getByTestId('tile-guard').first().hover()
  await expect(page.getByTestId('tooltip')).toContainText('보호 6')
  await expect(page.getByTestId('tooltip')).toContainText('1턴 유지')
})

test('막는다를 놓으면 목적어 칸은 주어와 같아 생략으로 보인다', async ({ page }) => {
  await page.getByTestId('tile-guard').first().click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('slot-0-object')).toContainText('주어와 같아 생략')
  await expect(page.getByTestId('particle-0-object')).toHaveCount(0)
})
