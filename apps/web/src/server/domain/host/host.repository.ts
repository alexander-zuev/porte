import type { HostId, UserId } from '@porte/core'

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
/**
 * The account's Mac, and what it may be used for.
 *
 * One row, three answers. Nothing hands out a Mac without saying which, so no
 * caller can act on a pairing that has ended by forgetting to ask.
 */
export type HostPairing =
  | { readonly state: 'unpaired' }
  | { readonly state: 'revoked'; readonly host: Host }
  | { readonly state: 'paired'; readonly host: Host }

export interface HostRepository {
  findPairing(userId: UserId): Promise<HostPairing>

  /** By its own id. The relay knows which Mac it holds, never whose it is. */
  findById(hostId: HostId): Promise<Host | null>

  /** Insert or overwrite the account's Mac. */
  save(host: Host): Promise<void>

  /** Drop the row outright. Used when the account itself goes away. */
  deleteByUserId(userId: UserId): Promise<void>
}
