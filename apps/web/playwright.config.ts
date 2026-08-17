import { defineConfig, devices } from '@playwright/test'

const PORT = 6008
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: {
    command:
      'pnpm run build-storybook && pnpm dlx sirv-cli storybook-static --single --port 6008 --quiet',
    url: `${BASE_URL}/iframe.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: BASE_URL,
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
