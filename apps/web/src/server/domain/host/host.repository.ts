import type { UserId } from '@porte/core'

import type { Host } from './host.aggregate.ts'

/**
 * Persistence for the host aggregate.
 *
 * Commands reach the database only through here. Queries do not use this at
 * all; they read their own shape directly, so a read never pays to rebuild an
 * aggregate it will not act on.
 *
 * Lookup is by owner rather than by host id because one account holds at most
 * one Mac, so the owner is the natural key for every command we have.
 */
export interface HostRepository {
  /** The account's Mac, revoked or not, or null when it has never registered one. */
  findByUserId(userId: UserId): Promise<Host | null>

  /** Insert or overwrite the account's Mac. */
  save(host: Host): Promise<void>

  /** Drop the row outright. Used when the account itself goes away. */
  deleteByUserId(userId: UserId): Promise<void>
}
