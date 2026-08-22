import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/server/infrastructure/persistence/database/schema',
  out: './src/server/infrastructure/persistence/database/migrations',
  dialect: 'sqlite',
})
