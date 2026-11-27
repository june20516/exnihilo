import type { Page } from '@playwright/test'
import { HOW_TO_PLAY_STORAGE_KEY } from '../../src/game/ui/howToPlaySteps.js'

/** 저장소를 비운 뒤 조작 안내를 이미 본 것으로 해 두고 다시 연다(안내 창이 게임 조작을 가리지 않게). */
export async function freshRunWithoutHowToPlay(page: Page) {
  await page.evaluate((key) => {
    window.localStorage.clear()
    window.localStorage.setItem(key, '1')
  }, HOW_TO_PLAY_STORAGE_KEY)
  await page.reload()
}
