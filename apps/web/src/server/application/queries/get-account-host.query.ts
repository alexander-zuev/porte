import {
  HostIdSchema,
  IsoDateTimeSchema,
  type AccountHost,
  type PairedHost,
  type UserId,
} from '@porte/core'
import {
  host,
  type DbHost,
} from '@server/infrastructure/persistence/database/schema/host.schema.ts'
import type { ReadDb } from '@server/infrastructure/persistence/database/types.ts'
import { eq } from 'drizzle-orm'

/**
 * What machine the signed-in account owns, if any.
 *
 * Reads the row directly rather than through the repository: this answers a
 * question, it does not act, so rebuilding an aggregate would buy nothing.
 *
 * Nothing here says whether the machine is reachable. That is a live question the
 * relay answers, and a read that guessed would be a second version of a fact it
 * cannot see.
 */
function toPairedHost(row: DbHost): PairedHost {
  return {
    id: HostIdSchema.parse(row.id),
    name: row.name,
    platform: row.platform,
    // Null until a daemon has announced itself. There is no earlier moment we
    // can honestly call an observation.
    lastSeenAt:
      row.lastSeenAt === null ? null : IsoDateTimeSchema.parse(row.lastSeenAt.toISOString()),
    cliVersion: row.cliVersion,
  }
}

export async function getAccountHost(db: ReadDb, userId: UserId): Promise<AccountHost> {
  const row = await db.select().from(host).where(eq(host.userId, userId)).get()
  if (!row) return { state: 'unpaired' }

  const paired = toPairedHost(row)
  return row.revokedAt === null
    ? { state: 'paired', host: paired }
    : { state: 'revoked', host: paired }
}
