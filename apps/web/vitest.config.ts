import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Unit tests only. Playwright owns the browser, so nothing here starts one.
 *
 * The Vite app config is not reused on purpose: it loads the Cloudflare and
 * TanStack Start plugins, which need a Worker to be meaningful and would make a
 * pure function's test wait for one.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@web': fileURLToPath(new URL('./src', import.meta.url)),
      '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
