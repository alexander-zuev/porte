import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { defineConfig } from 'drizzle-kit'

const isProd = process.env.DRIZZLE_ENV === 'production'
const localD1Dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required when DRIZZLE_ENV=production`)
  }
  return value
}

function localD1SqlitePath(): string {
  if (!existsSync(localD1Dir)) {
    return join(localD1Dir, 'local.sqlite')
  }

  const file = readdirSync(localD1Dir).find((name) => name.endsWith('.sqlite'))
  if (!file) {
    return join(localD1Dir, 'local.sqlite')
  }

  return join(localD1Dir, file)
}

export default defineConfig({
  schema: './src/server/infrastructure/persistence/database/schema',
  out: './src/server/infrastructure/persistence/database/migrations',
  dialect: 'sqlite',

  ...(isProd
    ? {
        driver: 'd1-http',
        dbCredentials: {
          accountId: requiredEnv('CLOUDFLARE_ACCOUNT_ID'),
          databaseId: requiredEnv('CLOUDFLARE_DATABASE_ID'),
          token: requiredEnv('CLOUDFLARE_D1_TOKEN'),
        },
      }
    : {
        dbCredentials: {
          url: localD1SqlitePath(),
        },
      }),

  strict: true,
  verbose: true,
  tablesFilter: ['!_cf_KV'],
})
