import type { AccountActionResult, UserId } from '@porte/core'

import type { HostRepository } from '../../domain/host/host.repository.ts'

/**
 * Release the Mac an account controls.
 *
 * The row stays and carries `revokedAt`, rather than being deleted. A daemon
 * holding a still-valid session must be refused on its next connection, and a
 * deleted row would read as "never paired" and let it straight back in.
 */
export async function unpairHost(
  hosts: HostRepository,
  userId: UserId,
  now: Date,
): Promise<AccountActionResult> {
  const host = await hosts.findByUserId(userId)

  // Nothing paired is the state the caller asked for, so report success.
  if (!host) return { ok: true }

  host.revoke(now)
  await hosts.save(host)
  return { ok: true }
}
