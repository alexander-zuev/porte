import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'

import * as schema from './schema/index.ts'

/**
 * The relay's own SQLite, as Drizzle sees it.
 *
 * Synchronous, unlike D1: reads return rows rather than promises, so reading a
 * page stays a plain call.
 */
export type RelayDb = DrizzleSqliteDODatabase<typeof schema>

/** Bound once per relay. Storage never rebinds, so nothing resolves this late. */
export function createRelayDatabase(storage: DurableObjectStorage): RelayDb {
  return drizzle(storage, { schema, logger: false })
}
