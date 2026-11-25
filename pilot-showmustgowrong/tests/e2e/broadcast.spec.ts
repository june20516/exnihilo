import { expect, test, type Page } from '@playwright/test'
import { INTERVENTION_REAL_SECONDS } from '../../src/content/balance'

const SCREENSHOT_PATH = 'tests/screens/broadcast-1280x720.png'
const INTERVENTION_SCREENSHOT_PATH = 'tests/screens/broadcast-intervention-1280x720.png'
const GAUGES = ['sexual', 'violence', 'drugs', 'language'] as const
const SWITCHERS = ['wide', 'close', 'audienceCam'] as const

/** 시드를 고정해 방송을 열고 첫 화면(시청자 수)이 뜰 때까지 기다린다. */
async function openBroadcast(page: Page): Promise<void> {
  await page.goto('/?seed=1')
  await expect(page.getByTestId('viewers')).toBeVisible({ timeout: 15_000 })
}

/** 요소가 1280×720 뷰포트 안에 완전히 들어와 있는가. body가 overflow hidden이라 scrollHeight만으로는 잘림을 못 잡는다. */
async function expectInViewport(page: Page, testId: string): Promise<void> {
  const box = await page.getByTestId(testId).boundingBox()
  expect(box, `${testId}가 보이지 않습니다`).not.toBeNull()
  if (box === null) return
  expect(box.x, `${testId} 왼쪽이 화면 밖`).toBeGreaterThanOrEqual(0)
  expect(box.y, `${testId} 위쪽이 화면 밖`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${testId} 오른쪽이 화면 밖`).toBeLessThanOrEqual(1280)
  expect(box.y + box.height, `${testId} 아래쪽이 화면 밖`).toBeLessThanOrEqual(720)
}

test('1280×720 한 화면에 시청자 수, 게이지 4개, 스위처 3개가 보인다', async ({ page }) => {
  await openBroadcast(page)
  const ids = [
    'viewers',
    'studio',
    'broadcast-time',
    'event-log',
    'intervene-button',
    'ad-button',
    ...GAUGES.map((gauge) => `gauge-${gauge}`),
    ...SWITCHERS.map((camera) => `switcher-${camera}`),
  ]
  for (const id of ids) {
    await expect(page.getByTestId(id)).toBeVisible()
    await expectInViewport(page, id)
  }
  const scroll = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  expect(scroll.height).toBeLessThanOrEqual(720)
  expect(scroll.width).toBeLessThanOrEqual(1280)
  // 캔버스가 실제로 붙었는지(렌더러 생성 완료)
  await expect(page.getByTestId('studio').locator('canvas')).toHaveCount(1)
  await page.screenshot({ path: SCREENSHOT_PATH })
})

test('키 2를 누르면 클로즈업 스위처가 송출 상태가 된다', async ({ page }) => {
  await openBroadcast(page)
  await expect(page.getByTestId('switcher-wide')).toHaveAttribute('data-on-air', 'true')
  await page.keyboard.press('2')
  await expect(page.getByTestId('switcher-close')).toHaveAttribute('data-on-air', 'true')
  await expect(page.getByTestId('switcher-wide')).toHaveAttribute('data-on-air', 'false')
})

test('미리보기를 누르면 그 카메라가 송출되고 ON AIR 이름표가 바뀐다', async ({ page }) => {
  await openBroadcast(page)
  const label = page.getByTestId('on-air-label')
  await expect(label).toContainText('CAM 1 무대 와이드')
  await page.getByTestId('switcher-close').click()
  await expect(label).toContainText('CAM 2 클로즈업')
  await expect(page.getByTestId('switcher-close')).toHaveAttribute('data-on-air', 'true')
  await page.getByTestId('switcher-audienceCam').click()
  await expect(label).toContainText('CAM 3 관객석')
})

/**
 * 출연자 몸 중심의 화면 좌표(스튜디오 host 기준 CSS px). 앱이 매 프레임 host의
 * data-actor-anchors에 싣는 값을 읽는다(투영 좌표를 하드코딩하지 않는다).
 */
async function actorAnchor(page: Page, actorId: string): Promise<{ x: number; y: number }> {
  const host = page.getByTestId('studio-host')
  await expect(host).toHaveAttribute('data-actor-anchors', new RegExp(`"${actorId}"`))
  const raw = await host.getAttribute('data-actor-anchors')
  const anchors: Record<string, [number, number]> = JSON.parse(raw ?? '{}')
  const [x, y] = anchors[actorId]
  return { x, y }
}

test('Space를 누르면 개입 패널이 열리고 개입 시간이 지나면 닫힌다', async ({ page }) => {
  await openBroadcast(page)
  const pressedAt = Date.now()
  await page.keyboard.press('Space')
  const panel = page.getByTestId('intervention-panel')
  await expect(panel).toBeVisible()
  // 스태프도 대상 목록에 있다
  await expect(panel.getByTestId('target-cameraOperator')).toBeVisible()
  await expectInViewport(page, 'intervention-panel')
  // 누른 지 (개입 시간 - 0.5)초에는 아직 열려 있고, (개입 시간 + 1)초 안에 닫힌다.
  // 여유는 프레임 지연(CI 흔들림)을 감안한 값이다.
  const durationMs = INTERVENTION_REAL_SECONDS * 1_000
  await page.waitForTimeout(durationMs - 500 - (Date.now() - pressedAt))
  await expect(panel).toBeVisible({ timeout: 100 })
  await expect(panel).toBeHidden({ timeout: durationMs + 1_000 - (Date.now() - pressedAt) })
})

test('광고 효과 2개를 골라 확정하면 남은 광고가 0회가 된다', async ({ page }) => {
  await openBroadcast(page)
  const adButton = page.getByTestId('ad-button')
  await expect(adButton).toHaveAttribute('data-ads-left', '1')
  await adButton.click()
  const panel = page.getByTestId('ad-panel')
  await expect(panel).toBeVisible()
  await expectInViewport(page, 'ad-panel')
  const confirm = panel.getByTestId('ad-confirm')
  await expect(confirm).toBeDisabled()
  await panel.getByTestId('ad-effect-relief').click()
  await panel.getByTestId('ad-effect-reset').click()
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(adButton).toHaveAttribute('data-ads-left', '0')
  await expect(page.getByTestId('commercial-break')).toBeVisible()
})

test('개입 밖에서 출연자를 클릭하면 송출 중인 클로즈업의 대상이 바뀐다', async ({ page }) => {
  await openBroadcast(page)
  await page.keyboard.press('2')
  const label = page.getByTestId('on-air-label')
  // 첫 코너(오프닝)의 클로즈업 시작 대상은 진행자 렉스다.
  await expect(label).toContainText('대상 렉스')
  await page.getByTestId('studio-host').click({ position: await actorAnchor(page, 'priya') })
  await expect(label).toContainText('대상 프리야')
  await expect(page.getByTestId('intervention-panel')).toBeHidden()
})

test('개입 버튼 → 출연자 클릭 → 카드와 줄어드는 남은 시간 → 지시하면 닫히고 로그에 결과가 남는다', async ({
  page,
}) => {
  await openBroadcast(page)
  const studio = page.getByTestId('studio')
  await expect(studio.locator('canvas')).toHaveCount(1)
  const noiseLines = page.getByTestId('event-log').getByText('렉스 쪽에서 소리가 난다')
  // 첫 코너 시작 때 렉스가 내는 소음 한 줄(lineup.ts의 corner 반응)
  await expect(noiseLines).toHaveCount(1)

  await page.getByTestId('intervene-button').click()
  const panel = page.getByTestId('intervention-panel')
  await expect(panel).toBeVisible()
  await page.getByTestId('studio-host').click({ position: await actorAnchor(page, 'rex') })
  await expect(panel.getByTestId('target-rex')).toHaveAttribute('aria-pressed', 'true')
  const card = panel.getByTestId('target-card')
  await expect(card).toContainText('남은 내성 5')
  await expect(card.getByTestId('misfire-chance')).toHaveCount(1)

  // 남은 선택 시간은 개입 시간에서 시작해 줄어든다.
  const seconds = page.getByTestId('intervention-seconds')
  const readSeconds = async (): Promise<number> => parseFloat((await seconds.textContent()) ?? '')
  const first = await readSeconds()
  expect(first).toBeLessThanOrEqual(INTERVENTION_REAL_SECONDS)
  expect(first).toBeGreaterThan(INTERVENTION_REAL_SECONDS - 2)
  await expect.poll(readSeconds, { timeout: 3_000 }).toBeLessThan(first - 0.5)
  await page.screenshot({ path: INTERVENTION_SCREENSHOT_PATH })

  // stepUp: 카메라로 돌진하며 소음 1을 낸다(lineup.ts). 로그에 그 소음 줄이 하나 더 남는다.
  await card.getByTestId('directive-stepUp').click()
  await expect(panel).toBeHidden()
  await expect(page.getByTestId('event-log')).toBeVisible()
  await expect(noiseLines).toHaveCount(2)
  await page.keyboard.press('Space')
  await expect(page.getByTestId('target-rex')).toContainText('내성 4')
})
