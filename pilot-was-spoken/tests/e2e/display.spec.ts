import { expect, type Locator, test } from '@playwright/test'
import { expectContentFits, expectInViewport, expectStacked } from './viewport.js'

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

test('손패 겹침: 폭이 넉넉하면 겹치지 않는다', async ({ page }) => {
  const tiles = page.getByTestId('hand').locator('[data-instance-id]:not([data-instance-id="basic"])')
  await expect(tiles).toHaveCount(6)
  const a = await tiles.nth(1).boundingBox()
  const b = await tiles.nth(2).boundingBox()
  if (!a || !b) throw new Error('카드 위치를 찾을 수 없습니다.')
  expect(a.x + a.width).toBeLessThanOrEqual(b.x)
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

test('개체 카드는 낭독과 적 차례를 거친 예상 HP를 "→ 28"로 보인다', async ({ page }) => {
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('hp-e0')).toContainText('34 / 34')
  await expect(page.getByTestId('hp-after-e0')).toContainText('→ 28')
})

test('서랍: 손잡이에 마우스를 올리면 열리고 벗어나면 닫힌다. 누르면 열린 채 고정된다', async ({ page }) => {
  const drawer = page.getByTestId('drawer-preview')
  await expect(drawer).toHaveAttribute('data-open', 'false')
  await page.getByTestId('drawer-preview-handle').hover()
  await expect(drawer).toHaveAttribute('data-open', 'true')
  await page.getByTestId('cast').hover()
  await expect(drawer).toHaveAttribute('data-open', 'false')
  await page.getByTestId('drawer-preview-handle').click()
  await page.getByTestId('cast').hover()
  await expect(drawer).toHaveAttribute('data-open', 'true')
  await page.getByTestId('drawer-preview-handle').click()
  await expect(drawer).toHaveAttribute('data-open', 'false')
})

test('왼쪽 서랍은 적용 중·서고(단어별 장수)·망각·서고 바닥 규칙을 보인다', async ({ page }) => {
  await page.getByTestId('drawer-resources-handle').click()
  const drawer = page.getByTestId('drawer-resources')
  await expect(drawer).toContainText('적용 중')
  await expect(drawer).toContainText('×')
  await expect(drawer).toContainText('망각')
  await expect(drawer).toContainText('서고가 비면')
})

test('미리보기는 개체별 HP "34 → 28"과 피해 칩을 보인다', async ({ page }) => {
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  await expect(page.getByTestId('preview-mine')).toContainText('34 → 28')
  await expect(page.getByTestId('preview-mine')).toContainText('피해 6')
})

test('계산식은 항마다 출처 칩을 보인다: 물어뜯는다 6 · 격렬하게 ×1.5 → = 9', async ({ page }) => {
  await page.getByTestId('tile-bite').first().click()
  await page.getByTestId('slot-0-verb').click()
  await page.getByTestId('tile-fiercely').first().click()
  await page.getByTestId('mod-0-verb-0').click()
  await expect(page.getByTestId('formula')).toContainText('물어뜯는다 6')
  await expect(page.getByTestId('formula-term')).toContainText('격렬하게 ×1.5')
  await expect(page.getByTestId('formula-result')).toHaveText('= 9')
})

test('적 예고는 문장과 행동 칩(공격 14)을 함께 보인다', async ({ page }) => {
  await expect(page.getByTestId('intent-e0')).toContainText('물어뜯는다')
  await expect(page.getByTestId('intent-e0')).toContainText('공격 14')
})

test('증폭 요소 패널이 늘 보이고, 유물이 없으면 "없음"', async ({ page }) => {
  await expect(page.getByTestId('amplifiers')).toBeVisible()
  await expect(page.getByTestId('amplifiers')).toContainText('없음')
})

test('적 초상화는 글자가 박힌 아래 띠를 잘라 낸 이미지를 쓴다(1260×540)', async ({ page }) => {
  const size = await page.evaluate(
    () =>
      new Promise<[number, number]>((resolve) => {
        const img = new Image()
        img.onload = () => resolve([img.naturalWidth, img.naturalHeight])
        img.src = '/assets/spider.jpg'
      }),
  )
  expect(size).toEqual([1260, 540])
})

test('1280×720에서도 핵심 요소가 화면 안에 있다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await expectInViewport(page, ['cast', 'end-turn', 'clear', 'hand', 'formula', 'amplifiers', 'pile-draw', 'drawer-preview-handle', 'drawer-resources-handle', 'intent-e0'])
  await expectStacked(page, 'battlefield', 'sentence')
  await expectStacked(page, 'formula', 'hand')
  await expectContentFits(page, 'sentence')
  await expectContentFits(page, 'stage')
  await page.getByTestId('drawer-preview-handle').click()
  await expect(page.getByTestId('preview-mine')).toBeInViewport({ ratio: 1 })
  await expect(page.getByTestId('preview-enemy')).toBeInViewport({ ratio: 1 })
})
