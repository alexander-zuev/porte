import { HostIdSchema, UserIdSchema, type UserId } from '@porte/core'
import { eq } from 'drizzle-orm'

import { Host } from '../../../domain/host/host.aggregate.ts'
import type { HostRepository } from '../../../domain/host/host.repository.ts'
import { host, type DbHost } from '../database/schema/host.schema.ts'
import type { Db } from '../database/types.ts'

/**
 * Map a stored row into the aggregate.
 *
 * The columns are plain text, so the identifiers are branded here, at the edge
 * where untrusted storage becomes a domain object.
 */
function toDomain(row: DbHost): Host {
  return Host.restore({
    id: HostIdSchema.parse(row.id),
    userId: UserIdSchema.parse(row.userId),
    name: row.name,
    platform: row.platform,
    revokedAt: row.revokedAt,
    lastSeenAt: row.lastSeenAt,
  })
}

/**
 * Host persistence over D1.
 *
 * Takes a connection getter rather than a connection, because the request
 * middleware rebinds it to a replica-routed session after the container is
 * built. Resolving late is what keeps a command on the right connection.
 */
export class DrizzleHostRepository implements HostRepository {
  constructor(private readonly db: () => Db) {}

  async findByUserId(userId: UserId): Promise<Host | null> {
    const row = await this.db().select().from(host).where(eq(host.userId, userId)).get()
    return row ? toDomain(row) : null
  }

  /**
   * Insert the account's Mac, or overwrite the one already there.
   *
   * Conflict targets `user_id`, not the primary key: an account holds one Mac,
   * so the owner is what collides. `id` is overwritten with the rest, because
   * re-pairing after unpair is a new host and must not inherit the relay object
   * the revoked one left behind.
   */
  async save(hostToSave: Host): Promise<void> {
    const snapshot = hostToSave.toPlainObject()

    await this.db()
      .insert(host)
      .values(snapshot)
      .onConflictDoUpdate({ target: host.userId, set: snapshot })
  }

  async deleteByUserId(userId: UserId): Promise<void> {
    await this.db().delete(host).where(eq(host.userId, userId))
  }
}
