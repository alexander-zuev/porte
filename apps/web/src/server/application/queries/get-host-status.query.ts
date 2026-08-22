import type { HostId, HostStatus, UserId } from '@porte/core'
import type { HostRelay } from '@server/application/ports/host-relay.ts'
import type { HostRepository } from '@server/domain/host/host.repository.ts'

/** No Mac is not a Mac that is away, but a screen has the same thing to say about both. */
const AWAY: HostStatus = { status: 'offline' }

/**
 * Whether the account's Mac is reachable right now.
 *
 * Read separately from the pairing, because the two change on different
 * timescales: pairing lasts months, and this changes when a laptop closes. A
 * page reads it once so its first paint is right, then the socket replaces it.
 */
export async function getHostStatus(
  hosts: HostRepository,
  relay: HostRelay,
  userId: UserId,
): Promise<HostStatus> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') return AWAY

  return relay.readStatus(pairing.host.id satisfies HostId)
}
