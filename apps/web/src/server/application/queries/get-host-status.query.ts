import type { HostId, HostStatus, UserId } from '@porte/core'
import type { HostRepository } from '@server/domain/host/host.repository.ts'
import type { IHostRelayClient } from '@web/server/application/ports/host-agent-client'

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
  relay: IHostRelayClient,
  userId: UserId,
): Promise<HostStatus> {
  const pairing = await hosts.findPairing(userId)
  if (pairing.state !== 'paired') return AWAY

  return relay.readStatus(pairing.host.id satisfies HostId)
}
