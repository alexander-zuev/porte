import type { ConversationId, UserId } from '@porte/core'
import type { HostRelay, HostRole } from '@server/application/ports/host-relay.ts'
import type { HostRepository } from '@server/domain/host/host.repository.ts'

/** Who is connecting, and the upgrade the relay must answer. */
export type ConnectHostRequest = {
  readonly userId: UserId
  /** Carried through: only the original request can become a WebSocket. */
  readonly request: Request
  readonly conversationId?: ConversationId
}

/**
 * Outcome of asking to join a relay.
 *
 * Owning no Mac, or owning a revoked one, is an ordinary answer rather than a
 * fault, so both come back as data. Turning either into a status code belongs
 * to the entrypoint.
 */
export type ConnectHostResult =
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
  relay: HostRelay,
  input: ConnectHostRequest,
): Promise<ConnectHostResult> {
  const pairing = await hosts.findPairing(input.userId)
  if (pairing.state !== 'paired') return { ok: false, reason: pairing.state }
  const role = roleOf(input.request)

  const response = await relay.connect({
    hostId: pairing.host.id,
    role,
    target:
      input.conversationId === undefined
        ? { type: 'host' }
        : { type: 'conversation', conversationId: input.conversationId },
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
