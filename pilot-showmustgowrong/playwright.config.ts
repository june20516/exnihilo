import { defineConfig, devices } from '@playwright/test'

const PORT = 5318

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 720 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
})
