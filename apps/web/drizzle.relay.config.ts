import { defineConfig } from 'drizzle-kit'

/** The relay's SQLite, inside its Durable Object. Separate from D1 so `d1 migrations apply` never sees it. */
export default defineConfig({
  schema: './src/server/infrastructure/persistence/relay/schema',
  out: './src/server/infrastructure/persistence/relay/migrations',
  dialect: 'sqlite',
  driver: 'durable-sqlite',
})
