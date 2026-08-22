import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * One Mac's conversations, replicated into its relay's own SQLite.
 *
 * Identity and metadata only: no message, no turn, no file. The browser reads
 * only this, so a sleeping Mac still has a list worth paging through.
 *
 * Lives in a Durable Object, not D1: its own Drizzle config, its own migrations.
 */
export const conversation = sqliteTable(
  'conversation',
  {
    id: text('id').primaryKey(),
    cwd: text('cwd').notNull(),
    title: text('title').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    /** Which sync run wrote this row. The sweep deletes every other run's, which is how a deletion propagates. */
    syncRunId: text('sync_run_id').notNull(),
  },
  (table) => [index('conversation_recent_idx').on(table.updatedAt, table.id)],
)

export type DbConversation = typeof conversation.$inferSelect
export type DbConversationInsert = typeof conversation.$inferInsert
