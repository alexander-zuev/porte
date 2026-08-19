import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { drizzle } from 'drizzle-orm/d1'

import { config } from './db-config'
import type * as schema from './schema'

export type DatabaseConnection = DrizzleD1Database<typeof schema>

/**
 * The D1 surface Drizzle actually uses.
 *
 * Both `D1Database` and `D1DatabaseSession` provide it, which is what lets a
 * request swap in a replica-routed session without a second connection type.
 */
export type D1Queryable = Pick<D1Database, 'prepare' | 'batch'>

/**
 * Create a Drizzle connection from a D1 binding or a D1 session.
 *
 * Cloudflare types a session separately from a database: it adds `getBookmark`
 * and drops `exec`, `dump`, and `withSession`. Drizzle wants the full type but
 * only ever calls `prepare` and `batch`, so the mismatch is resolved once here
 * rather than at each call site.
 */
export function createDatabase(client: D1Queryable): DatabaseConnection {
  // SAFETY: every method Drizzle reaches for is present on D1Queryable.
  return drizzle(client as D1Database, config)
}
