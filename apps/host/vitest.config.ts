import { defineConfig } from 'vitest/config'

export default defineConfig({
  // `@host/*` lives in tsconfig; Vitest only honours it when asked.
  resolve: { tsconfigPaths: true },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
