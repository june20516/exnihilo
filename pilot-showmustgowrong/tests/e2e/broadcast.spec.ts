import { expect, test, type Page } from '@playwright/test'
import { INTERVENTION_REAL_SECONDS } from '../../src/content/balance'
import { TUNING_STORAGE_KEY } from '../../src/content/tuning'

const SCREENSHOT_PATH = 'tests/screens/broadcast-1280x720.png'
const INTERVENTION_SCREENSHOT_PATH = 'tests/screens/broadcast-intervention-1280x720.png'
/** 커밋된 기준 스크린샷은 UPDATE_SCREENSHOTS=1로 돌릴 때만 다시 쓴다(실행마다 바이너리 diff가 나지 않게). */
const UPDATE_SCREENSHOTS = process.env.UPDATE_SCREENSHOTS === '1'

async function saveScreenshot(page: Page, path: string): Promise<void> {
  if (UPDATE_SCREENSHOTS) await page.screenshot({ path })
}
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
    'program-monitor',
    ...SWITCHERS.map((camera) => `switcher-slot-${camera}`),
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
  await saveScreenshot(page, SCREENSHOT_PATH)
})

test('L로 세 배치를 돌아도 위 띠는 한 줄로 넘치지 않고 주요 요소가 화면 안에 있으며 새로고침 뒤에도 배치가 남는다', async ({
  page,
}) => {
  await openBroadcast(page)
  const main = page.getByRole('main')
  const host = await page.getByTestId('studio-host').elementHandle()
  for (const layout of ['default', 'studio', 'onair'] as const) {
    await expect(main).toHaveAttribute('data-layout', layout)
    const band = await page.getByTestId('top-band').evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    expect(band.scrollWidth, `${layout} 위 띠가 넘칩니다`).toBeLessThanOrEqual(band.clientWidth)
    const ids = ['studio', 'program-monitor', 'event-log', 'intervene-button', 'ad-button', 'layout-toggle']
    for (const id of [...ids, ...SWITCHERS.map((camera) => `switcher-slot-${camera}`)]) {
      await expectInViewport(page, id)
    }
    // 렌더러를 다시 만들지 않는다: 처음 host 노드가 그대로 붙어 있고 캔버스는 하나다
    expect(await host?.evaluate((node) => node.isConnected)).toBe(true)
    await expect(page.getByTestId('studio').locator('canvas')).toHaveCount(1)
    if (layout !== 'onair') await page.keyboard.press('l')
  }
  await page.reload()
  await expect(page.getByTestId('viewers')).toBeVisible({ timeout: 15_000 })
  await expect(main).toHaveAttribute('data-layout', 'onair')
})

test('키 2를 누르면 클로즈업 스위처가 송출 상태가 된다', async ({ page }) => {
  await openBroadcast(page)
  await expect(page.getByTestId('switcher-slot-wide')).toHaveAttribute('data-on-air', 'true')
  await page.keyboard.press('2')
  await expect(page.getByTestId('switcher-slot-close')).toHaveAttribute('data-on-air', 'true')
  await expect(page.getByTestId('switcher-slot-wide')).toHaveAttribute('data-on-air', 'false')
})

test('송출이 바뀌어도 카메라 칸은 같은 자리에 있다', async ({ page }) => {
  await openBroadcast(page)
  const slotIndexes = async () =>
    Promise.all(
      SWITCHERS.map((camera) =>
        page.getByTestId(`switcher-slot-${camera}`).getAttribute('data-slot-index'),
      ),
    )
  await page.keyboard.press('2')
  await expect(page.getByTestId('switcher-slot-close')).toHaveAttribute('data-on-air', 'true')
  await expect(page.getByTestId('switcher-slot-close')).toHaveAttribute('data-slot-index', '1')
  await page.keyboard.press('3')
  const audienceSlot = page.getByTestId('switcher-slot-audienceCam')
  await expect(audienceSlot).toHaveAttribute('data-on-air', 'true')
  await expect(audienceSlot).toHaveAttribute('data-slot-index', '2')
  await expect(page.getByTestId('switcher-slot-close')).toHaveAttribute('data-slot-index', '1')
  expect(await slotIndexes()).toEqual(['0', '1', '2'])
})

test('미리보기를 누르면 그 카메라가 송출되고 ON AIR 이름표가 바뀐다', async ({ page }) => {
  await openBroadcast(page)
  const label = page.getByTestId('on-air-label')
  await expect(label).toContainText('CAM 1 무대 와이드')
  await page.getByTestId('switcher-slot-close').click()
  await expect(label).toContainText('CAM 2 클로즈업')
  await expect(page.getByTestId('switcher-slot-close')).toHaveAttribute('data-on-air', 'true')
  await page.getByTestId('switcher-slot-audienceCam').click()
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

/** 스튜디오에 그린 카메라 표시의 자리(스튜디오 영역 CSS 좌표) */
async function cameraAnchor(page: Page, cameraId: string): Promise<{ x: number; y: number }> {
  const host = page.getByTestId('studio-host')
  await expect(host).toHaveAttribute('data-camera-anchors', new RegExp(`"${cameraId}"`))
  const raw = await host.getAttribute('data-camera-anchors')
  const anchors: Record<string, [number, number]> = JSON.parse(raw ?? '{}')
  const [x, y] = anchors[cameraId]
  return { x, y }
}

/** 페이지 좌표의 from에서 스튜디오의 출연자 actorId까지 마우스로 끌어 놓는다. */
async function dragTo(page: Page, from: { x: number; y: number }, actorId: string): Promise<void> {
  const box = await page.getByTestId('studio-host').boundingBox()
  if (box === null) throw new Error('스튜디오가 보이지 않습니다')
  const to = await actorAnchor(page, actorId)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 })
  await page.mouse.up()
}

/** 스튜디오의 클로즈업 카메라 표시에서 출연자까지 끈다. */
async function dragCloseupTo(page: Page, actorId: string): Promise<void> {
  const box = await page.getByTestId('studio-host').boundingBox()
  if (box === null) throw new Error('스튜디오가 보이지 않습니다')
  const camera = await cameraAnchor(page, 'close')
  await dragTo(page, { x: box.x + camera.x, y: box.y + camera.y }, actorId)
}

/** 사고 로그에 보이는 가장 최근 줄 번호. 줄이 없으면 -1 */
async function newestLogIndex(page: Page): Promise<number> {
  const indexes = await page
    .getByTestId('event-log')
    .locator('li[data-log-index]')
    .evaluateAll((items) => items.map((item) => Number(item.getAttribute('data-log-index'))))
  return Math.max(-1, ...indexes)
}

/** 사고 로그에서 줄 번호가 after보다 큰 줄들의 문구 */
async function logTextsAfter(page: Page, after: number): Promise<string[]> {
  return page
    .getByTestId('event-log')
    .locator('li[data-log-index]')
    .evaluateAll(
      (items, minIndex) =>
        items
          .filter((item) => Number(item.getAttribute('data-log-index')) > minIndex)
          .map((item) => item.querySelector('[data-log-text]')?.getAttribute('data-log-text') ?? ''),
      after,
    )
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

test('개입 밖에서 클로즈업 카메라를 출연자에게 끌면 송출 중인 클로즈업의 대상이 바뀐다', async ({ page }) => {
  await openBroadcast(page)
  await page.keyboard.press('2')
  const label = page.getByTestId('on-air-label')
  // 첫 코너(오프닝)의 클로즈업 시작 대상은 진행자 렉스다.
  await expect(label).toContainText('대상 렉스')
  await dragCloseupTo(page, 'priya')
  await expect(label).toContainText('대상 프리야')
  await expect(page.getByTestId('intervention-panel')).toBeHidden()
})

test('개입 버튼 → 출연자 클릭 → 카드와 줄어드는 남은 시간 → 지시하면 닫히고 로그에 결과가 남는다', async ({
  page,
}) => {
  await openBroadcast(page)
  const studio = page.getByTestId('studio')
  await expect(studio.locator('canvas')).toHaveCount(1)
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
  await saveScreenshot(page, INTERVENTION_SCREENSHOT_PATH)

  // stepUp: 카메라로 돌진하며 소음 1을 낸다(lineup.ts). 지시 뒤에 생긴 줄(data-log-index가 더 큰 줄)에
  // 그 소음이 남는다. 줄 개수는 로그가 밀리면 흔들리므로 세지 않는다.
  const lastIndexBefore = await newestLogIndex(page)
  await card.getByTestId('directive-stepUp').click()
  await expect(panel).toBeHidden()
  await expect
    .poll(() => logTextsAfter(page, lastIndexBefore), { timeout: 3_000 })
    .toContain('렉스 쪽에서 소리가 난다')
  // 지시가 반영돼 내성이 하나 줄었다
  await page.keyboard.press('Space')
  await expect(page.getByTestId('target-rex')).toContainText('내성 4')
})

test('창 크기를 바꾼 뒤에도 클로즈업 카메라를 출연자에게 끌면 ON AIR와 미리보기의 대상이 바뀐다', async ({
  page,
}) => {
  await openBroadcast(page)
  const host = page.getByTestId('studio-host')
  const widthBefore = (await host.boundingBox())?.width ?? 0
  const anchorsBefore = await host.getAttribute('data-actor-anchors')
  await page.setViewportSize({ width: 1600, height: 900 })
  // 스튜디오가 새 크기로 바뀌고 앵커도 새 배율로 다시 실릴 때까지 기다린다.
  await expect.poll(async () => (await host.boundingBox())?.width ?? 0).not.toBe(widthBefore)
  await expect.poll(() => host.getAttribute('data-actor-anchors')).not.toBe(anchorsBefore)

  await page.keyboard.press('2')
  const label = page.getByTestId('on-air-label')
  await expect(label).toContainText('대상 렉스')
  await dragCloseupTo(page, 'priya')
  await expect(label).toContainText('대상 프리야')

  // 클로즈업이 미리보기일 때도 끌기가 대상을 바꾸고 미리보기 이름표에 보인다.
  await page.keyboard.press('1')
  const preview = page.getByTestId('switcher-slot-close').getByTestId('preview-target')
  await expect(preview).toContainText('대상 프리야')
  await dragCloseupTo(page, 'okafor')
  await expect(preview).toContainText('대상 오카포')
  await expect(page.getByTestId('intervention-panel')).toBeHidden()
  // 끌어 놓아도 미리보기 버튼의 카메라 전환은 일어나지 않는다.
  await expect(page.getByTestId('switcher-slot-wide')).toHaveAttribute('data-on-air', 'true')
})

test('클로즈업 미리보기 화면에서 출연자에게 끌어도 대상이 바뀌고, 그냥 누르면 전환된다', async ({
  page,
}) => {
  await openBroadcast(page)
  const previewButton = page.getByTestId('switcher-slot-close')
  const previewTarget = previewButton.getByTestId('preview-target')
  await expect(previewTarget).toContainText('대상 렉스')
  const box = await previewButton.boundingBox()
  if (box === null) throw new Error('클로즈업 미리보기가 보이지 않습니다')
  await dragTo(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 'mo')
  await expect(previewTarget).toContainText('대상 모')

  await previewButton.click()
  await expect(page.getByTestId('switcher-slot-close')).toHaveAttribute('data-on-air', 'true')
})

test('출연자를 클릭하면 클로즈업은 그대로 두고 성향과 스탯 설명을 고정해 띄운다', async ({
  page,
}) => {
  await openBroadcast(page)
  const host = page.getByTestId('studio-host')
  await host.click({ position: await actorAnchor(page, 'mo') })
  const tip = page.getByTestId('hover-tip')
  await expect(tip).toContainText('레슬러')
  await expect(tip).toContainText('존재감 2')
  await expect(page.getByTestId('switcher-slot-close').getByTestId('preview-target')).toContainText(
    '대상 렉스',
  )
})

test("'관객석 비춰 주세요' 뒤 이름표가 지시 고정을 알리고 카메라를 끌어 추적이 돌아온다", async ({
  page,
}) => {
  await openBroadcast(page)
  await page.keyboard.press('2')
  const label = page.getByTestId('on-air-label')
  await expect(label).toHaveAttribute('data-aim-mode', 'tracking')

  await page.keyboard.press('Space')
  const panel = page.getByTestId('intervention-panel')
  await panel.getByTestId('target-cameraOperator').click()
  await panel.getByTestId('target-card').getByTestId('directive-aimAudience').click()
  await expect(panel).toBeHidden()
  await expect(label).toHaveAttribute('data-aim-mode', 'directed')
  await expect(label).toContainText('대상 렉스 · 지시로 고정 (카메라를 출연자에게 끌면 추적)')
  await expectInViewport(page, 'on-air-label')

  await dragCloseupTo(page, 'rex')
  await expect(label).toHaveAttribute('data-aim-mode', 'tracking')
  await expect(label).not.toContainText('지시로 고정')
})

/** 페이지 스크립트보다 먼저 localStorage에 조정값을 둔다. 새로고침 때마다 다시 쓰므로 새로고침 테스트에는 쓰지 않는다. */
async function storeTuning(page: Page, json: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TUNING_STORAGE_KEY, json] as const,
  )
}

const MTB_INPUT = '작은 터짐 평균 대기 숫자'

test('저장된 조정값이 있으면 백틱으로 연 수치 조정에 그 값과 바뀜이 보인다', async ({ page }) => {
  await storeTuning(page, '{"SMALL_BURST_MTB_SHOW_SECONDS": 60}')
  await openBroadcast(page)
  const dialog = page.getByRole('dialog', { name: '수치 조정' })
  await expect(dialog).toBeHidden()
  await page.keyboard.press('`')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel(MTB_INPUT)).toHaveValue('60')
  await expect(dialog.getByText('바뀜')).toHaveCount(1)
  // 지금 방송이 이미 60으로 돌고 있으므로 다음 방송 안내는 없다
  await expect(dialog.getByText('다음 방송부터')).toHaveCount(0)
})

test('범위 밖 저장값은 버리고 알리며 게임은 기본값으로 정상 시작한다', async ({ page }) => {
  await storeTuning(page, '{"SMALL_BURST_MTB_SHOW_SECONDS": 99999}')
  await openBroadcast(page)
  // 버린 값이 있으면 패널이 열린 채로 시작한다
  const dialog = page.getByRole('dialog', { name: '수치 조정' })
  await expect(dialog).toContainText('저장값 1개를 쓰지 않았습니다')
  await expect(dialog).toContainText('SMALL_BURST_MTB_SHOW_SECONDS: 범위 밖')
  await expect(dialog.getByLabel(MTB_INPUT)).toHaveValue('50')
  await expect(page.getByTestId('studio').locator('canvas')).toHaveCount(1)
  const startTime = await page.getByTestId('broadcast-time').textContent()
  await expect(page.getByTestId('broadcast-time')).not.toHaveText(startTime ?? '', { timeout: 15_000 })
})

test('서로 어긋나는 저장값은 버리고 관계를 알리며 게임은 정상 시작한다', async ({ page }) => {
  await storeTuning(page, '{"threshold.fall1": 60}')
  await openBroadcast(page)
  const dialog = page.getByRole('dialog', { name: '수치 조정' })
  await expect(dialog).toContainText('저장값 1개를 쓰지 않았습니다')
  await expect(dialog).toContainText(
    'threshold.fall1: 다른 값과 맞지 않음 (1단계 내림 문턱은 0보다 크고 1단계 진입 문턱보다 작아야 합니다)',
  )
  await expect(dialog.getByLabel('1단계 내림 문턱 숫자')).toHaveValue('40')
  await expect(page.getByTestId('studio').locator('canvas')).toHaveCount(1)
})

test('패널에서 바꾼 값은 다음 방송부터 표시되고 새로고침 뒤 지금 값이 된다', async ({ page }) => {
  await openBroadcast(page)
  await page.keyboard.press('`')
  const dialog = page.getByRole('dialog', { name: '수치 조정' })
  const input = dialog.getByLabel(MTB_INPUT)
  await input.fill('')
  // 숫자를 키로 쳐서 게임의 1·2·3 카메라 단축키로 새지 않는지도 본다
  await input.pressSequentially('120')
  await expect(input).toHaveValue('120')
  await expect(dialog.getByText('다음 방송부터')).toHaveCount(1)
  await expect(page.getByTestId('switcher-slot-wide')).toHaveAttribute('data-on-air', 'true')

  await page.reload()
  await expect(page.getByTestId('viewers')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('`')
  await expect(dialog.getByLabel(MTB_INPUT)).toHaveValue('120')
  await expect(dialog.getByText('바뀜')).toHaveCount(1)
  await expect(dialog.getByText('다음 방송부터')).toHaveCount(0)
})

/** 페이지에 표식을 둔다. 다시 불러오면 사라지므로 다시 하기가 페이지를 다시 불러왔는지 가린다 */
async function markPage(page: Page): Promise<void> {
  await page.evaluate(() => Reflect.set(window, '__beforeRestart', true))
}

async function pageWasKept(page: Page): Promise<boolean> {
  return page.evaluate(() => Reflect.get(window, '__beforeRestart') === true)
}

async function restartFromResult(page: Page): Promise<void> {
  // 방송 길이 실제 10초라 결과 화면은 실제 약 10초 뒤에 뜬다
  await page.getByTestId('restart-button').click({ timeout: 20_000 })
  await expect(page.getByTestId('viewers')).toBeVisible({ timeout: 15_000 })
}

test('조정값이 같으면 다시 하기가 페이지를 유지하고, 바꿨으면 다시 불러와 바뀐 값으로 시작한다', async ({ page }) => {
  test.setTimeout(60_000)
  await openBroadcast(page)
  // 방송을 실제 10초로 줄여 결과 화면까지 빨리 간다. storeTuning은 새로고침마다 덮어쓰므로 쓰지 않는다
  await page.evaluate(
    ([key]) => window.localStorage.setItem(key, JSON.stringify({ BROADCAST_REAL_SECONDS: 10 })),
    [TUNING_STORAGE_KEY] as const,
  )
  await page.reload()
  await expect(page.getByTestId('viewers')).toBeVisible({ timeout: 15_000 })

  // 바꾼 값이 없으면 같은 페이지에서 새 방송을 시작한다
  await markPage(page)
  await restartFromResult(page)
  expect(await pageWasKept(page)).toBe(true)

  // 방송 중 값을 바꾸면 다음 방송부터가 보이고, 다시 하기가 페이지를 다시 불러온다
  await page.keyboard.press('`')
  const dialog = page.getByRole('dialog', { name: '수치 조정' })
  await dialog.getByLabel(MTB_INPUT).fill('120')
  await expect(dialog.getByText('다음 방송부터')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await restartFromResult(page)
  expect(await pageWasKept(page)).toBe(false)
  expect(new URL(page.url()).searchParams.get('seed')).toBe('1')

  await page.keyboard.press('`')
  await expect(dialog.getByLabel(MTB_INPUT)).toHaveValue('120')
  await expect(dialog.getByText('다음 방송부터')).toHaveCount(0)
})
