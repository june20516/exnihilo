import { expect, type Locator, type Page, test } from '@playwright/test'
import { expectInViewport } from './viewport.js'

test.use({ viewport: { width: 1440, height: 900 } })

/** 시드 5의 시작 손패: 막는다, 금이 간, 치유한다, 굶주린, 격렬하게, 물어뜯는다 (거미·거미 떼 모두). */
const SEED = 5

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

test.beforeEach(async ({ page }) => {
  await page.goto(`/?mode=rally&seed=${SEED}`)
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('end-turn')).toBeVisible()
})

test('1440×900에서 스크롤 없이 한 화면, 예고·미리보기가 보인다', async ({ page }) => {
  await expectInViewport(page, ['cast', 'end-turn', 'clear', 'hand', 'formula', 'amplifiers', 'pile-draw'])
  await expect(page.getByTestId('intent-e0')).toBeInViewport()
  await expect(page.getByTestId('intent-e0')).toContainText('물어뜯는다')
  await expect(page.getByTestId('preview-enemy')).toBeInViewport()
  await expect(page.getByTestId('preview-mine')).toBeInViewport()
})

test('빈 주어는 당신으로 보이고, 동사를 놓으면 계산식이 나온다', async ({ page }) => {
  await expect(page.getByTestId('slot-0-subject')).toContainText('당신')
  await expect(page.getByTestId('formula')).toContainText('동사를 놓으면')
  await page.getByTestId('tile-bite').click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('formula')).toContainText('물어뜯는다 6')
  await expect(page.getByTestId('formula-result')).toHaveText('= 6')
  await page.getByTestId('tile-fiercely').click()
  await page.getByTestId('mod-0-verb-0').click()
  await expect(page.getByTestId('formula-term')).toContainText('격렬하게 ×1.5')
  await expect(page.getByTestId('formula-result')).toHaveText('= 9')
})

test('동사 한 장을 끌어다 놓고 낭독하면 적 HP가 줄고 2턴이 된다', async ({ page }) => {
  await dragBySteps(page, page.getByTestId('tile-bite'), page.getByTestId('slot-0-verb'))
  await expect(page.getByTestId('slot-0-verb')).toContainText('물어뜯는다')
  await page.getByTestId('cast').click()
  await expect(page.getByTestId('hp-e0')).toContainText('HP 28 / 34')
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 10_000 })
  await expect(page.getByTestId('turn')).toContainText('턴 2')
})

test('동사가 없으면 낭독할 수 없다', async ({ page }) => {
  await expect(page.getByTestId('cast')).toBeDisabled()
})

test('버리기: 카드 두 장을 표시하고 확정하면 손패 수는 같고 버리기는 비활성', async ({ page }) => {
  // 손패 카드만 센다(기본 동사 타일은 손패가 아니다).
  const tiles = page.getByTestId('hand').locator('[data-instance-id]:not([data-instance-id="basic"])')
  await expect(tiles).toHaveCount(6)
  await page.getByTestId('discard').click()
  await tiles.nth(0).click()
  await tiles.nth(1).click()
  await expect(page.getByTestId('discard-confirm')).toContainText('2장 버리기')
  await page.getByTestId('discard-confirm').click()
  await expect(tiles).toHaveCount(6)
  await expect(page.getByTestId('discard')).toBeDisabled()
})

test('대상 변경(거미 떼): 적을 누르면 목적어가 그 적 이름이 된다', async ({ page }) => {
  await page.getByTestId('encounter').selectOption('swarm')
  await expect(page.getByTestId('slot-0-object')).toContainText('새끼 거미 1')
  await page.locator('[data-entity-id="e1"]').click()
  await expect(page.getByTestId('slot-0-object')).toContainText('새끼 거미 2')
})

test('연출 재생 중에는 턴 종료가 잠긴다', async ({ page }) => {
  await page.getByTestId('end-turn').click()
  await expect(page.getByTestId('end-turn')).toBeDisabled()
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 10_000 })
})

test('덱 편집: 카드를 빼고 저장하면 덱 장수가 바뀐다', async ({ page }) => {
  await page.getByTestId('open-deck').click()
  await page.getByTestId('minus-bite').click()
  await expect(page.getByTestId('deck-count')).toContainText('14장')
  await page.getByTestId('deck-save').click()
  await expect(page.getByTestId('open-deck')).toContainText('14장')
})

test('연출이 끝나기 전에는 HP와 턴이 낭독 전 상태로 보이고, 끝나면 바뀐다', async ({ page }) => {
  await page.getByTestId('tile-bite').click()
  await page.getByTestId('slot-0-verb').click()
  await page.getByTestId('cast').click()
  await expect(page.getByTestId('hp-e0')).toContainText('HP 34 / 34')
  await expect(page.getByTestId('turn')).toContainText('턴 1')
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 10_000 })
  await expect(page.getByTestId('hp-e0')).toContainText('HP 28 / 34')
  await expect(page.getByTestId('turn')).toContainText('턴 2')
})

test('형용사 상태: 금이 간을 목적어에 놓으면 적 카드에 남을 상태가 보이고, 연출 중에도 남아 있다', async ({ page }) => {
  await page.getByTestId('tile-bite').click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('states-e0')).toHaveCount(0)
  await page.getByTestId('tile-cracked').click()
  await page.getByTestId('mod-0-object-0').click()
  await expect(page.getByTestId('states-e0')).toContainText('금이 감 · 적 차례까지')
  await page.getByTestId('cast').click()
  await expect(page.getByTestId('states-e0')).toContainText('금이 감')
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 10_000 })
  await expect(page.getByTestId('states-e0')).toHaveCount(0)
})

test('기본 동사 타일을 동사 칸에 놓고 낭독하면 다음 턴에 다시 쓸 수 있다', async ({ page }) => {
  const basic = page.getByTestId('tile-basic')
  await expect(basic).toBeVisible()
  await basic.click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('slot-0-verb')).toContainText('때린다')
  await expect(basic).toBeDisabled()
  await page.getByTestId('cast').click()
  await expect(page.getByTestId('turn')).toContainText('2', { timeout: 10_000 })
  await expect(basic).toBeEnabled()
})
