import { expect, test } from '@playwright/test'
import { HOW_TO_PLAY_STEPS } from '../../src/game/ui/howToPlaySteps.js'
import { expectInViewport } from './viewport.js'

const RUN_URL = '/?seed=5'

test.beforeEach(async ({ page }) => {
  await page.goto(RUN_URL)
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
})

test('처음 오면 플레이 방법이 뜨고, 다음으로 끝까지 넘긴 뒤 시작하면 닫힌다', async ({ page }) => {
  const dialog = page.getByTestId('how-to-play')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('how-to-play-page')).toHaveText(`1 / ${HOW_TO_PLAY_STEPS.length}`)
  await expect(page.getByTestId('how-to-play-prev')).toBeDisabled()
  for (const step of HOW_TO_PLAY_STEPS) {
    await expect(dialog.getByRole('heading')).toHaveText(step.title)
    await page.getByTestId('how-to-play-next').click()
  }
  await expect(dialog).toBeHidden()
  // 닫은 뒤에는 게임을 바로 조작할 수 있다.
  await page.getByTestId('tile-basic').click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('cast')).toBeEnabled()
})

test('한 번 닫으면 다시 접속해도 뜨지 않고, 위쪽 ? 버튼으로 다시 열 수 있다', async ({ page }) => {
  await page.getByTestId('how-to-play-skip').click()
  await page.reload()
  await expect(page.getByTestId('run-floor')).toBeVisible()
  await expect(page.getByTestId('how-to-play')).toBeHidden()
  await page.getByTestId('how-to-play-open').click()
  await expect(page.getByTestId('how-to-play-page')).toHaveText(`1 / ${HOW_TO_PLAY_STEPS.length}`)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('how-to-play')).toBeHidden()
})

test('이전 버튼과 방향키로 앞뒤 장을 오간다', async ({ page }) => {
  await page.getByTestId('how-to-play-next').click()
  await expect(page.getByTestId('how-to-play-page')).toHaveText(`2 / ${HOW_TO_PLAY_STEPS.length}`)
  await page.getByTestId('how-to-play-prev').click()
  await expect(page.getByTestId('how-to-play-page')).toHaveText(`1 / ${HOW_TO_PLAY_STEPS.length}`)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('how-to-play-page')).toHaveText(`2 / ${HOW_TO_PLAY_STEPS.length}`)
})

test.describe('가로 휴대폰(844×390)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })
  test('안내 창 전체와 버튼이 화면 안에 들어온다', async ({ page }) => {
    // 가장 긴 장(설명 세 줄)에서 확인한다.
    const longest = HOW_TO_PLAY_STEPS.reduce((best, s, i) => (s.lines.join('').length > HOW_TO_PLAY_STEPS[best]!.lines.join('').length ? i : best), 0)
    for (let i = 0; i < longest; i++) await page.getByTestId('how-to-play-next').tap()
    await expectInViewport(page, ['how-to-play-next', 'how-to-play-skip', 'how-to-play-page'])
  })
})
