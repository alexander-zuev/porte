import { defineConfig } from 'vitest/config'

/**
 * Three projects, three costs. `unit` and `integration` run everywhere.
 * `live` spawns the real Grok CLI and spends tokens: it runs from `test:live`
 * (pre-push). A plain `vitest run` includes it, but every live suite is wrapped
 * in `describeLive` and skips itself unless `GROK_LIVE_TESTS=1` is set.
 */
export default defineConfig({
  // `@host/*` lives in tsconfig; Vitest only honours it when asked.
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      { extends: true, test: { name: 'integration', include: ['tests/integration/**/*.test.ts'] } },
      {
        extends: true,
        // One file at a time: every live file drives the same Grok process and session store.
        test: { name: 'live', include: ['tests/live/**/*.test.ts'], fileParallelism: false },
      },
    ],
  },
})
