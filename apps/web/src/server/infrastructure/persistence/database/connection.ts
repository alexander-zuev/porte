import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { drizzle } from 'drizzle-orm/d1'

import { config } from './db-config'
import type * as schema from './schema'

export type DatabaseConnection = DrizzleD1Database<typeof schema>

/** Create a Drizzle connection from the Worker D1 binding. */
export function createDatabase(d1: D1Database): DatabaseConnection {
  return drizzle(d1, config)
}
