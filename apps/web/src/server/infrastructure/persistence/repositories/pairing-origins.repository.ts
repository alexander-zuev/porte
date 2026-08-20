import { eq } from 'drizzle-orm'

import type {
  PairingOrigins,
  PairingRequestRecord,
} from '../../../application/ports/pairing-origins.ts'
import { pairingRequest, type DbPairingRequestInsert } from '../database/schema/pairing.schema.ts'
import type { Db } from '../database/types.ts'

/**
 * Pairing origins over D1.
 *
 * Takes a connection getter for the same reason the host repository does: the
 * request middleware rebinds it after the container is built.
 */
export class DrizzlePairingOrigins implements PairingOrigins {
  constructor(private readonly db: () => Db) {}

  async record(userCode: string, request: PairingRequestRecord): Promise<void> {
    const row = toRow(request)

    // A reissued code overwrites its predecessor; only the latest can be decided.
    await this.db()
      .insert(pairingRequest)
      .values({ userCode, ...row })
      .onConflictDoUpdate({ target: pairingRequest.userCode, set: row })
  }

  async find(userCode: string): Promise<PairingRequestRecord | null> {
    const row = await this.db()
      .select()
      .from(pairingRequest)
      .where(eq(pairingRequest.userCode, userCode))
      .get()

    if (!row) return null
    return {
      host: { name: row.hostName, platform: row.hostPlatform },
      origin: { ipAddress: row.ipAddress, country: row.country, city: row.city },
      requestedAt: row.requestedAt,
    }
  }

  async forget(userCode: string): Promise<void> {
    await this.db().delete(pairingRequest).where(eq(pairingRequest.userCode, userCode))
  }
}

/** The record's two nested values, flattened to the columns that hold them. */
function toRow(request: PairingRequestRecord): Omit<DbPairingRequestInsert, 'userCode'> {
  return {
    hostName: request.host.name,
    hostPlatform: request.host.platform,
    ipAddress: request.origin.ipAddress,
    country: request.origin.country,
    city: request.origin.city,
    requestedAt: request.requestedAt,
  }
}
