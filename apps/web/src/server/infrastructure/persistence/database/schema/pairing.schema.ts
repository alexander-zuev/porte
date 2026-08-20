import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Where a pairing code was asked for.
 *
 * Kept apart from Better Auth's `deviceCode`, which we do not own. Its only
 * reader is the confirmation screen, which answers "did this come from the
 * machine I am sitting at?" — a question only the request moment can settle,
 * because by approval time the headers describe whoever is approving.
 *
 * The row is deleted when the code is decided, so an address never outlives
 * the decision it informed.
 */
export const pairingRequest = sqliteTable('pairing_request', {
  /** Better Auth's user code. Not a foreign key: that table is theirs. */
  userCode: text('user_code').primaryKey(),
  ipAddress: text('ip_address').notNull(),
  /** Two-letter code and city, as Cloudflare resolved them. Either may be absent. */
  country: text('country'),
  city: text('city'),
  requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
})

export type DbPairingRequest = typeof pairingRequest.$inferSelect
export type DbPairingRequestInsert = typeof pairingRequest.$inferInsert
