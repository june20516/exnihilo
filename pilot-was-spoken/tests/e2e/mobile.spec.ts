import { expect, type Locator, type Page, test } from '@playwright/test'
import { expectContentFits, expectInViewport, expectStacked } from './viewport.js'

/** 터치 대상 최소 크기(px, 표시 spec §3.8). */
const MIN_TOUCH = 40

async function longPress(page: Page, target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error('위치를 찾을 수 없습니다.')
  const init = { pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, bubbles: true, isPrimary: true }
  await target.dispatchEvent('pointerdown', init)
  await page.waitForTimeout(700)
  await target.dispatchEvent('pointerup', init)
}

test.describe('세로(390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('rotate-notice만 보이고 게임 화면은 보이지 않는다', async ({ page }) => {
    await page.goto('/?mode=rally&seed=5')
    await expect(page.getByTestId('rotate-notice')).toBeVisible()
    await expect(page.getByTestId('rotate-notice')).toContainText('가로로 돌려 주세요')
    await expect(page.getByTestId('hand')).toBeHidden()
  })
})

test.describe('가로(844×390, 터치)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=rally&seed=5')
    await page.evaluate(() => window.localStorage.clear())
    await page.reload()
    await expect(page.getByTestId('end-turn')).toBeVisible()
  })

  test('늘 보이는 요소가 모두 화면 안에 있고, 안내는 보이지 않는다', async ({ page }) => {
    await expect(page.getByTestId('rotate-notice')).toBeHidden()
    await expectInViewport(page, ['cast', 'end-turn', 'clear', 'hand', 'formula', 'drawer-preview-handle', 'drawer-resources-handle', 'pile-draw', 'amplifiers', 'intent-e0', 'discard'])
  })

  test('적 초상화가 보이고(높이 40px 이상), 844×390에서는 스크롤 없이 한 화면이다', async ({ page }) => {
    const portrait = await page.locator('[data-portrait="e0"]').boundingBox()
    expect(portrait?.height ?? 0).toBeGreaterThanOrEqual(40)
    await expectContentFits(page, 'stage')
  })

  test('미리보기 서랍: 탭하면 열려 화면 안에 보이고, 바깥쪽으로 밀면 닫힌다', async ({ page }) => {
    await page.getByTestId('drawer-preview-handle').tap()
    await expect(page.getByTestId('drawer-preview')).toHaveAttribute('data-open', 'true')
    await expect(page.getByTestId('preview-mine')).toBeInViewport({ ratio: 1 })
    const handle = page.getByTestId('drawer-preview-handle')
    const box = await handle.boundingBox()
    if (!box) throw new Error('손잡이를 찾을 수 없습니다.')
    const at = (x: number) => ({ pointerType: 'touch', clientX: x, clientY: box.y + box.height / 2, bubbles: true, isPrimary: true })
    await handle.dispatchEvent('pointerdown', at(box.x + 10))
    await handle.dispatchEvent('pointermove', at(box.x + 60))
    await handle.dispatchEvent('pointerup', at(box.x + 60))
    await expect(page.getByTestId('drawer-preview')).toHaveAttribute('data-open', 'false')
  })

  test('눌려서 겹치지 않는다: 전투 영역 → 문장판 → 손패 순서, 미리보기는 내용을 담을 높이', async ({ page }) => {
    await page.getByTestId('tile-bite').first().tap()
    await page.getByTestId('slot-0-verb').tap()
    // 배치 연출(칸이 잠깐 커짐)이 끝난 뒤의 배치를 잰다.
    await expect(page.getByTestId('end-turn')).toBeEnabled()
    await expectStacked(page, 'battlefield', 'sentence')
    await expectStacked(page, 'sentence', 'formula')
    await expectStacked(page, 'formula', 'hand')
    await expectContentFits(page, 'sentence')
  })

  test('주요 터치 대상은 40px 이상이다', async ({ page }) => {
    for (const id of ['cast', 'end-turn', 'discard', 'clear', 'slot-0-verb', 'tile-basic']) {
      const box = await page.getByTestId(id).first().boundingBox()
      expect(box, id).not.toBeNull()
      expect(Math.min(box?.width ?? 0, box?.height ?? 0), id).toBeGreaterThanOrEqual(MIN_TOUCH)
    }
  })

  test('카드 탭 → 칸 탭으로 배치된다', async ({ page }) => {
    await page.getByTestId('tile-bite').first().tap()
    await page.getByTestId('slot-0-verb').tap()
    await expect(page.getByTestId('slot-0-verb')).toContainText('물어뜯는다')
  })

  test('카드를 길게 누르면 설명 툴팁이 화면 안에 뜬다', async ({ page }) => {
    await longPress(page, page.getByTestId('tile-guard').first())
    await expect(page.getByTestId('tooltip')).toBeInViewport()
    await expect(page.getByTestId('tooltip')).toContainText('보호 6')
  })
})

test.describe('가로(844×320, 더 낮은 화면)', () => {
  test.use({ viewport: { width: 844, height: 320 }, hasTouch: true, isMobile: true })
  test('높이에 맞춰 더 줄이지 않고(폭 기준 비율 유지), 아래는 세로 스크롤로 보인다', async ({ page }) => {
    await page.goto('/?mode=rally&seed=5')
    await expect(page.getByTestId('end-turn')).toBeAttached()
    const stage = page.getByTestId('stage')
    expect(Number(await stage.evaluate((el) => getComputedStyle(el).zoom))).toBeCloseTo(844 / 1180, 2)
    expect(await stage.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await page.getByTestId('end-turn').scrollIntoViewIfNeeded()
    await expectInViewport(page, ['end-turn'])
  })
})

test.describe('가로(844×390) 상점', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })
  test('상점 화면도 스크롤 없이 보상 3개와 새로고침·다음 층 버튼이 보인다', async ({ page }) => {
    await page.goto('/?seed=5&debugEnemyHp=1')
    await page.evaluate(() => window.localStorage.clear())
    await page.reload()
    await page.getByTestId('tile-bite').first().tap()
    await page.getByTestId('slot-0-verb').tap()
    await page.getByTestId('cast').tap()
    await expect(page.getByTestId('leave-shop')).toBeVisible({ timeout: 10_000 })
    await expectInViewport(page, ['leave-shop', 'shop-reroll', 'offer'])
    await expect(page.getByTestId('offer')).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      const box = await page.getByTestId('offer').nth(i).boundingBox()
      expect(box && box.y + box.height <= 390, `보상 ${i + 1}`).toBe(true)
    }
  })
})

test.describe('가로(844×390) 버리기 모드', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })
  test('버리기 모드에서도 확정 버튼과 손패가 화면 안에 있다', async ({ page }) => {
    await page.goto('/?mode=rally&seed=5')
    await page.getByTestId('discard').tap()
    await expectInViewport(page, ['discard', 'discard-confirm', 'hand', 'cast', 'end-turn'])
  })
})

test.describe('가로(844×390) 터치 세부', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=rally&seed=5')
    await expect(page.getByTestId('end-turn')).toBeVisible()
  })

  test('끌 수 있는 카드와 놓은 단어는 touch-action: none이다(브라우저 화면 이동이 드래그를 끊지 않게)', async ({ page }) => {
    const touchAction = (testId: string) => page.getByTestId(testId).first().evaluate((el) => getComputedStyle(el).touchAction)
    expect(await touchAction('tile-bite')).toBe('none')
    await page.getByTestId('tile-bite').first().tap()
    await page.getByTestId('slot-0-verb').tap()
    const placed = await page.getByTestId('slot-0-verb').locator('[aria-roledescription="draggable"]').first().evaluate((el) => getComputedStyle(el).touchAction)
    expect(placed).toBe('none')
  })

  test('길게 눌러 툴팁을 열면 그 카드는 선택되지 않는다', async ({ page }) => {
    const card = page.getByTestId('tile-guard').first()
    await longPress(page, card)
    await card.dispatchEvent('click')
    await expect(page.getByTestId('tooltip')).toBeVisible()
    await expect(card).toHaveAttribute('data-selected', 'false')
  })
})
