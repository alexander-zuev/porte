import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig, type Plugin } from 'vitest/config'

const alias = {
  '@web': fileURLToPath(new URL('./src', import.meta.url)),
  '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
}

/**
 * Load `.sql` as a string, which is how Drizzle ships migrations.
 *
 * The app build gets this from `@cloudflare/vite-plugin`, which is not loaded
 * here. Without it the bundler parses the migration as JavaScript and fails on
 * its first line. `load` rather than `transform`, because parsing comes first.
 */
function sqlAsText(): Plugin {
  return {
    name: 'sql-as-text',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith('.sql')) return null

      return `export default ${JSON.stringify(await readFile(id, 'utf8'))}`
    },
  }
}

/**
 * Two projects, because they need different runtimes.
 *
 * `unit` is plain Node: pure functions, with no Worker to wait for.
 * `integration` runs in workerd, which is the only place a Durable Object's
 * SQLite and its migrations exist.
 *
 * The Vite app config is not reused on purpose: it loads the Cloudflare and
 * TanStack Start plugins, which need the whole app to be meaningful. Playwright
 * owns the browser, so nothing here starts one.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        plugins: [
          sqlAsText(),
          // The relay reaches TanStack Start through `createAppDeps`, so its
          // entry aliases have to resolve even though no route is exercised.
          tanstackStart({
            router: {
              entry: './lib/router/router.tsx',
              generatedRouteTree: './lib/router/routeTree.gen.ts',
            },
          }),
          // The real Worker and the real bindings. Nothing is redeclared here,
          // so a binding these tests use is one the deployed Worker also has.
          cloudflareTest({
            main: './tests/integration/relay.worker.ts',
            wrangler: { configPath: './wrangler.jsonc', environment: 'test' },
          }),
        ],
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
        },
      },
    ],
  },
})
