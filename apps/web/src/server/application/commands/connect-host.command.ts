import type { UserId } from '@porte/core'

import type { HostRepository } from '../../domain/host/host.repository.ts'
import type { HostCoordinator, HostRole } from '../ports/host-coordinator.ts'

/** Who is connecting, and the upgrade the relay must answer. */
export type ConnectHostRequest = {
  readonly userId: UserId
  /** Carried through: only the original request can become a WebSocket. */
  readonly request: Request
}

/**
 * Outcome of asking to join a relay.
 *
 * Owning no Mac, or owning a revoked one, is an ordinary answer rather than a
 * fault, so both come back as data. Turning either into a status code belongs
 * to the entrypoint.
 */
export type HostConnection =
  | { readonly ok: true; readonly response: Response }
  | { readonly ok: false; readonly reason: 'unpaired' | 'revoked' }

/**
 * Join an account's daemon or browser to the relay that serves its Mac.
 *
 * The caller has already proved who the person is. This proves which Mac is
 * theirs and names the relay after it, so nothing on the wire carries a host
 * id and one account can never address another's.
 *
 * A revoked pairing is refused here rather than at the relay, which is what
 * makes unpairing hold on the next connection.
 */
export async function connectHost(
  hosts: HostRepository,
  coordinator: HostCoordinator,
  input: ConnectHostRequest,
): Promise<HostConnection> {
  const host = await hosts.findByUserId(input.userId)
  if (host === null) return { ok: false, reason: 'unpaired' }
  if (host.isRevoked) return { ok: false, reason: 'revoked' }

  const response = await coordinator.connect({
    hostId: host.id,
    role: roleOf(input.request),
    request: input.request,
  })
  return { ok: true, response }
}

/**
 * Which side of the relay is calling.
 *
 * A browser cannot set headers on a WebSocket, so an `Authorization` header
 * only ever came from the daemon and a cookie only from a browser. The role is
 * proven by the credential that arrived rather than claimed by the caller.
 */
function roleOf(request: Request): HostRole {
  return request.headers.get('authorization') === null ? 'client' : 'daemon'
}
