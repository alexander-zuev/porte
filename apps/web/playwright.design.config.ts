import { defineConfig, devices } from '@playwright/test'

const PORT = 6008
const BASE_URL = `http://localhost:${PORT}`

/**
 * The design suite: the design system measured in a real browser, against a
 * built Storybook. It never starts the app, so it owns no database and no auth.
 * Product flows against a live server belong to a separate e2e config.
 */
export default defineConfig({
  testDir: './tests/design',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: {
    // The build runs in the `test:design` script, not here: the story list is read
    // off `storybook-static/index.json` while Playwright collects the tests,
    // which happens before this server starts.
    command: 'pnpm dlx sirv-cli storybook-static --single --port 6008 --quiet',
    url: `${BASE_URL}/iframe.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: BASE_URL,
    contextOptions: { reducedMotion: 'reduce' },
    // Most checks here assert a number. The number says a control is clipped;
    // only the picture says which one, so a failure carries both.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
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
