import { applyD1Migrations, type D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_DATABASE_MIGRATIONS?: D1Migration[]
    }
  }
}

/** Apply the production D1 migrations for one isolated integration file. */
export async function applyDatabaseTestMigrations(): Promise<void> {
  const database = env.DB
  if (database === undefined) throw new Error('DB is not bound')
  const migrations = env.TEST_DATABASE_MIGRATIONS
  if (migrations === undefined) throw new Error('Test migrations are not bound')
  await applyD1Migrations(database, migrations)
}
