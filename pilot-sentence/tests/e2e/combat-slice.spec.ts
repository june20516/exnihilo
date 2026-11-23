import { expect, type Locator, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

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

for (const preset of ['A', 'B', 'C']) {
  test(`프리셋 ${preset}: 1440×900에서 스크롤 없이 한 화면`, async ({ page }) => {
    await page.goto(`/?seed=123&preset=${preset}`)
    await expect(page.getByTestId('end-turn')).toBeVisible()
    const { scrollH, innerH } = await page.evaluate(() => ({
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
    }))
    expect(scrollH).toBeLessThanOrEqual(innerH)
    await expect(page.getByTestId('intent')).toBeInViewport()
    await expect(page.getByTestId('preview')).toBeInViewport()
  })
}

test('뒤바꾸기: 주어와 목적어가 맞바뀌고 미리보기가 갱신된다', async ({ page }) => {
  await page.goto('/?seed=123&preset=A')
  await expect(page.getByTestId('slot-0-subject')).toContainText('거미')
  await page.getByTestId('swap').click()
  await expect(page.getByTestId('slot-0-subject')).toContainText('당신')
  await expect(page.getByTestId('slot-0-object')).toContainText('거미')
  await expect(page.getByTestId('preview')).toContainText('탐험가 → 거미')
})

test('드래그로 단어를 슬롯에 놓을 수 있다', async ({ page }) => {
  await page.goto('/?seed=123&preset=A')
  await dragBySteps(page, page.getByTestId('tile-you').first(), page.getByTestId('slot-0-subject'))
  await expect(page.getByTestId('slot-0-subject')).toContainText('당신')
  await expect(page.getByTestId('particle-0-subject')).toHaveText('이')
})

test('낭독(프리셋 C): 누르면 문장이 실행되고 다음 턴으로 넘어간다', async ({ page }) => {
  await page.goto('/?seed=123&preset=C')
  await page.getByTestId('cast').click()
  await expect(page.getByTestId('hp-p')).not.toContainText('HP 60 / 60')
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 10_000 })
})

test('덱 편집: 카드를 빼고 저장하면 덱 장수가 바뀐다', async ({ page }) => {
  await page.goto('/?seed=123&preset=B')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await page.getByTestId('open-deck').click()
  await page.getByTestId('minus-bite').click()
  await expect(page.getByTestId('deck-count')).toContainText('14장')
  await page.getByTestId('deck-save').click()
  await expect(page.getByTestId('open-deck')).toContainText('14장')
})

test('연출 재생 중에는 턴 종료 버튼이 잠긴다', async ({ page }) => {
  await page.goto('/?seed=123&preset=A')
  await page.getByTestId('end-turn').click()
  await expect(page.getByTestId('end-turn')).toBeDisabled()
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 10_000 })
})
