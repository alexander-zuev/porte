import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * One machine's conversations, replicated into its relay's own SQLite.
 *
 * Identity and metadata only: no message, no turn, no file. The browser reads
 * only this, so a sleeping machine still has a list worth paging through.
 *
 * Lives in a Durable Object, not D1: its own Drizzle config, its own migrations.
 */
export const conversation = sqliteTable(
  'conversation',
  {
    id: text('id').primaryKey(),
    cwd: text('cwd').notNull(),
    /** Repository the conversation belongs to. The browser groups the list on it. */
    gitRoot: text('git_root').notNull(),
    title: text('title').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('conversation_recent_idx').on(table.updatedAt, table.id)],
)

export type DbConversation = typeof conversation.$inferSelect
export type DbConversationInsert = typeof conversation.$inferInsert
