import type { HostRelayState } from '@porte/core/client'

/** This browser's connection to the relay: the socket, and the last state the relay sent over it. */
export type RelayConnection = {
  /** True once the socket is open and the relay has answered; false again on close. */
  readonly identified: boolean
  /** Undefined until the relay's first state frame. */
  readonly state: HostRelayState | undefined
}

/**
 * The end-to-end connection from this browser to the paired machine, from two facts:
 * the relay socket (`identified`) and what the relay reports about the machine.
 *
 * - `loading`: the relay has not answered yet (no state frame). Spinner.
 * - `connecting`: the socket dropped and is retrying on its own. Flashing dot.
 * - `connected`: socket open, machine online.
 * - `offline`: socket open, machine not connected to the relay. Only the machine can fix it.
 */
export type HostConnection =
  | { readonly status: 'loading' }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
  | { readonly status: 'offline' }

export type HostConnectionStatus = HostConnection['status']

/** What to tell the person when the connection moves from one status to the next. */
export type HostConnectionNotice = 'host-offline' | 'host-online'

/**
 * Only a machine that leaves or returns is news. A page that opens onto an offline
 * machine already shows it, and a socket blip (`connecting`) belongs to the header dot.
 */
export function hostConnectionNotice(
  before: HostConnectionStatus,
  after: HostConnectionStatus,
): HostConnectionNotice | undefined {
  if (before === 'connected' && after === 'offline') return 'host-offline'
  if (before === 'offline' && after === 'connected') return 'host-online'
  return undefined
}

/** Socket first, then the machine. Pure, so every branch is a one-line test. */
export function hostConnectionFrom({ identified, state }: RelayConnection): HostConnection {
  if (state === undefined) return { status: 'loading' }
  if (!identified) return { status: 'connecting' }
  return state.hostStatus === 'online' ? { status: 'connected' } : { status: 'offline' }
}
