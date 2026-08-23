import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import agents from 'agents/vite'
import { defineConfig, type Plugin } from 'vitest/config'

const alias = {
  '@web': fileURLToPath(new URL('./src', import.meta.url)),
  '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
}

const databaseMigrationsPath = fileURLToPath(
  new URL('./src/server/infrastructure/persistence/database/migrations', import.meta.url),
)

/** Loads Drizzle SQL before the integration bundler tries to parse it as JavaScript. */
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

/** Separates fast Node tests from integration tests that need workerd and Durable Objects. */
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
          agents(),
          // The relay reaches TanStack Start through `createAppDeps`, so its
          // entry aliases have to resolve even though no route is exercised.
          tanstackStart({
            router: {
              entry: './lib/router/router.tsx',
              generatedRouteTree: './lib/router/routeTree.gen.ts',
            },
          }),
          // The facet binding is test-only because workerd cannot discover it through ctx.exports.
          cloudflareTest(async () => ({
            main: './tests/integration/relay.worker.ts',
            miniflare: {
              bindings: {
                TEST_DATABASE_MIGRATIONS: await readD1Migrations(databaseMigrationsPath),
              },
              durableObjects: {
                CONVERSATION_AGENT_TEST: {
                  className: 'ConversationAgent',
                  useSQLite: true,
                },
              },
            },
            wrangler: { configPath: './wrangler.jsonc', environment: 'test' },
          })),
        ],
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
        },
      },
    ],
  },
})
