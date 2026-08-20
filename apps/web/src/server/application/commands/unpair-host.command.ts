import type { AccountActionResult, UserId } from '@porte/core'

import type { HostRepository } from '../../domain/host/host.repository.ts'
import type { HostRelay } from '../ports/host-relay.ts'

/**
 * Release the Mac an account controls.
 *
 * The row stays and carries `revokedAt`, rather than being deleted. A daemon
 * holding a still-valid session must be refused on its next connection, and a
 * deleted row would read as "never paired" and let it straight back in.
 *
 * Revoking is written before the relay is emptied. The other order would let a
 * daemon reconnect into the gap and be allowed, because the row still said it
 * could.
 */
export async function unpairHost(
  hosts: HostRepository,
  relay: HostRelay,
  userId: UserId,
  now: Date,
): Promise<AccountActionResult> {
  const host = await hosts.findByUserId(userId)

  // Nothing paired is the state the caller asked for, so report success.
  if (!host) return { ok: true }

  host.revoke(now)
  await hosts.save(host)

  // Refusing the next connection is not enough. A daemon already holding a
  // socket would keep serving a pairing that has ended.
  await relay.disconnect(host.id)
  return { ok: true }
}
