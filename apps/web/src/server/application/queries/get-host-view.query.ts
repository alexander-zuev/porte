import { IsoDateTimeSchema, type HostView, type PairedHost, type UserId } from '@porte/core'
import { eq } from 'drizzle-orm'

import { host, type DbHost } from '../../infrastructure/persistence/database/schema/host.schema.ts'
import type { ReadDb } from '../../infrastructure/persistence/database/types.ts'

/**
 * What Mac the signed-in account owns, if any.
 *
 * Reads the row directly rather than through the repository: this answers a
 * question, it does not act, so rebuilding an aggregate would buy nothing.
 *
 * Nothing here says whether the Mac is reachable. That is a live question the
 * relay answers, and a read that guessed would be a second version of a fact it
 * cannot see.
 */
function toPairedHost(row: DbHost): PairedHost {
  return {
    name: row.name,
    platform: row.platform,
    // Null until a daemon has announced itself. There is no earlier moment we
    // can honestly call an observation.
    lastSeenAt:
      row.lastSeenAt === null ? null : IsoDateTimeSchema.parse(row.lastSeenAt.toISOString()),
  }
}

export async function getHostView(db: ReadDb, userId: UserId): Promise<HostView> {
  const row = await db.select().from(host).where(eq(host.userId, userId)).get()
  if (!row) return { state: 'unpaired' }

  const paired = toPairedHost(row)
  return row.revokedAt === null
    ? { state: 'paired', host: paired }
    : { state: 'revoked', host: paired }
}
