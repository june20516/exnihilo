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
    await expectInViewport(page, ['cast', 'end-turn', 'clear', 'hand', 'formula', 'preview-mine', 'preview-enemy', 'pile-draw', 'amplifiers', 'intent-e0', 'discard'])
  })

  test('눌려서 겹치지 않는다: 전투 영역 → 문장판 → 손패 순서, 미리보기는 내용을 담을 높이', async ({ page }) => {
    await page.getByTestId('tile-bite').first().tap()
    await page.getByTestId('slot-0-verb').tap()
    // 배치 연출(칸이 잠깐 커짐)이 끝난 뒤의 배치를 잰다.
    await expect(page.getByTestId('end-turn')).toBeEnabled()
    await expectStacked(page, 'battlefield', 'sentence')
    await expectStacked(page, 'sentence', 'formula')
    await expectStacked(page, 'formula', 'hand')
    // 미리보기는 개체 한 줄(이름·HP·막대·칩)이 목록 안에 넘치지 않고 다 들어가야 한다.
    await expectContentFits(page, 'preview-mine-list')
    await expectContentFits(page, 'preview-enemy-list')
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
