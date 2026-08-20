import { HOST_PLATFORMS } from '@porte/core'
import { relations, sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { user } from './auth.schema'

/**
 * The Mac an account controls.
 *
 * `userId` is unique because the first release binds one host to one account,
 * so a second host is unrepresentable rather than merely discouraged.
 *
 * There is no credential column. The daemon authenticates with the Better Auth
 * session issued by the device authorization grant; this row answers the other
 * question, which is whether that user's Mac is still allowed to connect.
 */
export const host = sqliteTable(
  'host',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    platform: text('platform', { enum: HOST_PLATFORMS }).notNull(),
    /** Set by unpairing. A revoked host is refused even with a valid session. */
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    /** Last time the relay held a live connection. Availability is derived, never stored. */
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('host_user_id_idx').on(table.userId)],
)

export const hostRelations = relations(host, ({ one }) => ({
  user: one(user, { fields: [host.userId], references: [user.id] }),
}))

export type DbHost = typeof host.$inferSelect
export type DbHostInsert = typeof host.$inferInsert
