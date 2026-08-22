import { HostIdSchema, type HostId, type UserId } from '@porte/core'
import { Host, type HostSnapshot } from '@server/domain/host/host.aggregate.ts'
import type { HostPairing, HostRepository } from '@server/domain/host/host.repository.ts'
import {
  host,
  type DbHost,
} from '@server/infrastructure/persistence/database/schema/host.schema.ts'
import type { Db } from '@server/infrastructure/persistence/database/types.ts'
import { and, eq, isNull, lt, or } from 'drizzle-orm'

/**
 * Map a stored row into the aggregate.
 *
 * The columns are plain text, so the identifiers are branded here, at the edge
 * where untrusted storage becomes a domain object.
 */
function toDomain(row: DbHost): Host {
  return Host.restore({
    id: HostIdSchema.parse(row.id),
    // SAFETY: the column is written from a session's user id, which Better Auth
    // minted through `generateId`. Nothing else can put a row here.
    userId: row.userId as UserId,
    name: row.name,
    platform: row.platform,
    revokedAt: row.revokedAt,
    lastSeenAt: row.lastSeenAt,
    pairedAt: row.createdAt,
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

  async findPairing(userId: UserId): Promise<HostPairing> {
    const row = await this.db().select().from(host).where(eq(host.userId, userId)).get()
    if (!row) return { state: 'unpaired' }

    const paired = toDomain(row)
    return paired.isRevoked ? { state: 'revoked', host: paired } : { state: 'paired', host: paired }
  }

  async findById(hostId: HostId): Promise<Host | null> {
    const row = await this.db().select().from(host).where(eq(host.id, hostId)).get()
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
      .values(toRow(snapshot))
      .onConflictDoUpdate({ target: host.userId, set: toRow(snapshot) })
  }

  async recordSeen(hostId: HostId, at: Date): Promise<void> {
    await this.db()
      .update(host)
      .set({ lastSeenAt: at })
      .where(and(eq(host.id, hostId), or(isNull(host.lastSeenAt), lt(host.lastSeenAt, at))))
  }

  async deleteByUserId(userId: UserId): Promise<void> {
    await this.db().delete(host).where(eq(host.userId, userId))
  }
}

/** `pairedAt` is stored in `created_at`, which the column was already for. */
function toRow(snapshot: HostSnapshot) {
  const { pairedAt, ...rest } = snapshot
  return { ...rest, createdAt: pairedAt }
}
