import { IsoDateTimeSchema, type HostView, type PairedHost, type UserId } from '@porte/core'
import { eq } from 'drizzle-orm'

import { host, type DbHost } from '../../infrastructure/persistence/database/schema/host.schema.ts'
import type { ReadDb } from '../../infrastructure/persistence/database/types.ts'

/**
 * What the signed-in account controls right now.
 *
 * Reads the row directly rather than through the repository: this answers a
 * question, it does not act, so rebuilding an aggregate would buy nothing.
 */

/**
 * Availability is a live relay connection, which the Durable Object owns rather
 * than D1. Until the query asks the coordinator, report offline and let the
 * client show when the Mac was last seen.
 */
function toPairedHost(row: DbHost): PairedHost {
  // A host that has never connected falls back to when we first recorded it,
  // which is the earliest moment we can honestly claim to have known about it.
  const lastSeen = row.lastSeenAt ?? row.createdAt

  return {
    name: row.name,
    platform: row.platform,
    availability: 'offline',
    lastSeenAt: IsoDateTimeSchema.parse(lastSeen.toISOString()),
  }
}

export async function getHostView(db: ReadDb, userId: UserId): Promise<HostView> {
  const row = await db.select().from(host).where(eq(host.userId, userId)).get()

  // No row means no daemon has ever announced itself, which is what the phone
  // sees between approving the grant and the Mac reconnecting.
  if (!row) return { state: 'unpaired' }

  const paired = toPairedHost(row)
  if (row.revokedAt !== null) return { state: 'revoked', host: paired }

  // Sessions are not persisted yet, so a paired host reports none.
  return { state: 'paired', host: paired, sessions: [], runningSessionIds: [] }
}
