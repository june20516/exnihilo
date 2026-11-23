import { expect, type Locator, type Page, test } from '@playwright/test'

test('당신을 주어에 놓고 턴을 끝내면 예고대로 되돌려져 내가 맞는다', async ({ page }) => {
  await page.goto('/?seed=123')
  await expect(page.getByTestId('slot-0-subject')).toContainText('거미')
  await page.getByTestId('tile-you').first().click()
  await page.getByTestId('slot-0-subject').click()
  await expect(page.getByTestId('slot-0-subject')).toContainText('당신')
  await expect(page.getByTestId('particle-0-subject')).toHaveText('이')
  await page.getByTestId('end-turn').click()
  await expect(page.getByTestId('hp-p')).toContainText('52')
  await expect(page.getByTestId('slot-0-subject')).toContainText('거미')
})

/** 사람처럼 여러 단계로 끈다. dnd-kit은 6px 이상 움직여야 드래그로 인식한다. */
async function dragBySteps(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  if (!a || !b) throw new Error('요소 위치를 찾을 수 없습니다.')
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 - 10, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })
  await page.mouse.up()
}

test('드래그로 단어를 슬롯에 놓을 수 있다', async ({ page }) => {
  await page.goto('/?seed=123')
  await dragBySteps(page, page.getByTestId('tile-you').first(), page.getByTestId('slot-0-object'))
  await expect(page.getByTestId('slot-0-object')).toContainText('당신')
  await expect(page.getByTestId('ap')).toContainText('2 / 3')
})

test('연출 재생 중에는 턴 종료 버튼이 잠긴다', async ({ page }) => {
  await page.goto('/?seed=123')
  await page.getByTestId('end-turn').click()
  await expect(page.getByTestId('end-turn')).toBeDisabled()
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 10_000 })
})
