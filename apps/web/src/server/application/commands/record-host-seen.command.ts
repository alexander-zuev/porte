import type { HostId } from '@porte/core'
import type { HostRepository } from '@server/domain/host/host.repository.ts'

/**
 * Note that the relay held this Mac at a moment.
 *
 * Called when a daemon arrives and again when it goes, because those are the
 * two moments anyone observed it. A Mac that vanished without closing keeps the
 * time it arrived, which is still the last thing Porte actually saw.
 *
 * A missing row is not a fault: the pairing can end while a socket is open, and
 * there is simply nothing left to write on.
 */
export async function recordHostSeen(
  hosts: HostRepository,
  hostId: HostId,
  at: Date,
): Promise<void> {
  const host = await hosts.findById(hostId)
  if (host === null) return

  host.markSeen(at)
  await hosts.save(host)
}
