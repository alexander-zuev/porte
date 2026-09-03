import type { HostFailure } from '@host/application/ports/remote-control-store.ts'
import { AcpStartError } from '@host/infrastructure/acp/error.ts'
import {
  WebSocketHandshakeRefused,
  WebSocketProtocolClose,
} from '@host/infrastructure/websocket/websocket-errors.ts'

/**
 * What the daemon does after the Host stopped on its own.
 *
 * `wait-for-change`: nothing the daemon does will help; the person must act, and
 * their action rewrites the settings or the credential. `after-delay`: the relay
 * closed the socket for malformed frames, which a fresh Host usually heals.
 * `next-poll`: a Host bug or an unknown stop; a restart is cheap and may work.
 */
export type HostStopDecision =
  | { readonly retry: 'next-poll' }
  | { readonly retry: 'after-delay' }
  | { readonly retry: 'wait-for-change'; readonly failure: HostFailure }

/** Decide by type, never by message text. Unknown errors restart on the next poll. */
export function classifyHostStop(cause: unknown): HostStopDecision {
  if (cause instanceof WebSocketHandshakeRefused) {
    if (cause.status === 401 || cause.status === 403) {
      return { retry: 'wait-for-change', failure: { type: 'unauthorized', http: cause.status } }
    }
    return { retry: 'wait-for-change', failure: { type: 'refused', http: cause.status } }
  }
  if (cause instanceof AcpStartError) {
    return { retry: 'wait-for-change', failure: { type: 'agent-start' } }
  }
  if (cause instanceof WebSocketProtocolClose) return { retry: 'after-delay' }
  return { retry: 'next-poll' }
}
