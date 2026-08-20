import { HOST_PLATFORMS } from '@porte/core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * What asked for a pairing code, and from where.
 *
 * Kept apart from Better Auth's `deviceCode`, which we do not own. Only the
 * request moment can answer either question: by approval time the headers
 * describe whoever is approving. The confirmation screen reads the address to
 * ask "did this come from the machine I am sitting at?", and approval reads
 * the name to record which Mac it just granted.
 *
 * The row is deleted when the code is decided, so nothing here outlives the
 * decision it informed.
 */
export const pairingRequest = sqliteTable('pairing_request', {
  /** Better Auth's user code. Not a foreign key: that table is theirs. */
  userCode: text('user_code').primaryKey(),
  /** As the machine named itself. `host_platform` stays the runtime's token. */
  hostName: text('host_name').notNull(),
  hostPlatform: text('host_platform', { enum: HOST_PLATFORMS }).notNull(),
  ipAddress: text('ip_address').notNull(),
  /** Two-letter code and city, as Cloudflare resolved them. Either may be absent. */
  country: text('country'),
  city: text('city'),
  requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
})

export type DbPairingRequest = typeof pairingRequest.$inferSelect
export type DbPairingRequestInsert = typeof pairingRequest.$inferInsert
