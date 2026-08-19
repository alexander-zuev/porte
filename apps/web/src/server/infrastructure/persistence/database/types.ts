import type { DrizzleD1Database } from 'drizzle-orm/d1'

import type * as schema from './schema'
import type { user } from './schema'

export type Db = DrizzleD1Database<typeof schema>

/**
 * Row type for the generated auth tables.
 *
 * It lives here rather than beside the table because `auth.schema.ts` is
 * overwritten in full by `pnpm better-auth-generate`. Hand-written schemas
 * export their own types.
 */
export type DbUser = typeof user.$inferSelect
