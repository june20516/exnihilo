import { expect, type Page, test } from '@playwright/test'
import { expectInViewport } from './viewport.js'

test.use({ viewport: { width: 1440, height: 900 } })

/** 시드 5: 1층은 슬라임 하나, 시작 손패에 물어뜯는다가 있다. 개발 플래그로 적 HP를 1로 만든다. */
const RUN_URL = '/?seed=5&debugEnemyHp=1'

const priceOf = async (page: Page, index: number) => Number((await page.getByTestId('offer-price').nth(index).innerText()).replace(/\D/g, ''))
const gold = async (page: Page) => Number((await page.getByTestId('run-gold').innerText()).replace(/\D/g, ''))

async function winFloorOne(page: Page) {
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  await page.getByTestId('cast').click()
}

test.beforeEach(async ({ page }) => {
  await page.goto(RUN_URL)
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
})

test('런 시작: 상단에 층·HP·화폐가 보이고 한 화면에 들어간다', async ({ page }) => {
  await expect(page.getByTestId('run-floor')).toContainText('1/7')
  await expect(page.getByTestId('run-gold')).toContainText('0')
  await expect(page.getByTestId('run-hp')).toContainText('60')
  await expectInViewport(page, ['cast', 'end-turn', 'clear', 'hand', 'formula'])
})

test('1층 승리: 연출이 끝난 뒤 상점이 열리고 화폐 25를 받는다', async ({ page }) => {
  await winFloorOne(page)
  await expect(page.getByTestId('end-turn')).toBeVisible()
  await expect(page.getByTestId('leave-shop')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('run-gold')).toContainText('25')
  await expect(page.getByTestId('offer')).toHaveCount(3)
  await expectInViewport(page, ['leave-shop', 'offer', 'build-deck'])
})

test('상점: 사면 화폐가 줄고 남은 값이 ×1.5(올림) 오르며, 화폐가 모자란 보상은 누를 수 없다', async ({ page }) => {
  await winFloorOne(page)
  await expect(page.getByTestId('leave-shop')).toBeVisible({ timeout: 10_000 })
  const prices = await Promise.all([0, 1, 2].map((i) => priceOf(page, i)))
  const cheapest = prices.indexOf(Math.min(...prices))
  await page.getByTestId('offer').nth(cheapest).click()
  await expect(page.getByTestId('offer').nth(cheapest)).toContainText('팔림')
  expect(await gold(page)).toBe(25 - prices[cheapest])
  for (const i of [0, 1, 2].filter((i) => i !== cheapest)) {
    expect(await priceOf(page, i)).toBe(Math.ceil(prices[i] * 1.5))
  }
  const left = await gold(page)
  for (const i of [0, 1, 2].filter((i) => i !== cheapest)) {
    const offer = page.getByTestId('offer').nth(i)
    if ((await priceOf(page, i)) > left) {
      await expect(offer).toBeDisabled()
      await expect(offer).toContainText('화폐 부족')
    } else {
      await expect(offer).toBeEnabled()
    }
  }
})

test('넘어가기: 2층 전투가 시작된다', async ({ page }) => {
  await winFloorOne(page)
  await page.getByTestId('leave-shop').click({ timeout: 10_000 })
  await expect(page.getByTestId('run-floor')).toContainText('2/7')
  await expect(page.getByTestId('end-turn')).toBeVisible()
})

test('샌드박스 덱이 저장돼 있어도 런은 시작 덱 15장으로 한다', async ({ page }) => {
  await page.evaluate(() => window.localStorage.setItem('pilot-sentence.deck.v2', JSON.stringify(Array(12).fill('slash'))))
  await page.reload()
  await winFloorOne(page)
  await expect(page.getByTestId('build-deck')).toContainText('덱 15장', { timeout: 10_000 })
})

test('연출이 끝나기 전에는 상단 바가 정산 결과(화폐)를 먼저 보여 주지 않는다', async ({ page }) => {
  await winFloorOne(page)
  await expect(page.getByTestId('end-turn')).toBeVisible()
  await expect(page.getByTestId('run-gold')).toContainText('화폐 0')
  await expect(page.getByTestId('leave-shop')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('run-gold')).toContainText('화폐 25')
})

test('새 런은 두 번 눌러야 시작되고, 연출 중에는 누를 수 없다', async ({ page }) => {
  await page.getByTestId('new-run').click()
  await expect(page.getByTestId('new-run')).toContainText('한 번 더')
  await expect(page.getByTestId('run-seed')).toContainText('seed 5')
  await page.getByTestId('new-run').click()
  await expect(page.getByTestId('run-seed')).toContainText('seed 6')
  await page.getByTestId('end-turn').click()
  await expect(page.getByTestId('new-run')).toBeDisabled()
})

test('1층에서 새 런을 시작하면 전투 화면의 선택·버리기 모드가 초기화된다', async ({ page }) => {
  await page.getByTestId('discard').click()
  await expect(page.getByTestId('discard-confirm')).toBeVisible()
  await page.getByTestId('new-run').click()
  await page.getByTestId('new-run').click()
  await expect(page.getByTestId('run-seed')).toContainText('seed 6')
  await expect(page.getByTestId('discard-confirm')).toHaveCount(0)
})

test('화폐가 모자란 보상은 마우스를 올려도 강조되지 않는다', async ({ page }) => {
  await winFloorOne(page)
  await expect(page.getByTestId('leave-shop')).toBeVisible({ timeout: 10_000 })
  const offers = page.getByTestId('offer')
  // 살 수 있는 가장 싼 보상을 계속 사서, 화폐가 모자란 보상을 만든다.
  for (let round = 0; round < 3 && (await page.locator('[data-testid="offer"][data-poor="true"]').count()) === 0; round++) {
    let cheapest = -1
    let best = Infinity
    for (let i = 0; i < 3; i++) {
      if (!(await offers.nth(i).isEnabled())) continue
      const price = await priceOf(page, i)
      if (price < best) [best, cheapest] = [price, i]
    }
    if (cheapest < 0) break
    await offers.nth(cheapest).click()
  }
  const poor = page.locator('[data-testid="offer"][data-poor="true"]').first()
  await expect(poor).toBeVisible()
  const shadow = () => poor.evaluate((el) => getComputedStyle(el).boxShadow)
  const before = await shadow()
  await poor.hover({ force: true })
  expect(await shadow()).toBe(before)
})
