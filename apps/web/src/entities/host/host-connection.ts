import type { HostRelayState } from '@porte/core/client'

/** This browser's connection to the relay: the socket, and the last state the relay sent over it. */
export type RelayConnection = {
  /** True once the socket is open and the relay has answered; false again on close. */
  readonly identified: boolean
  /** Undefined until the relay's first state frame. */
  readonly state: HostRelayState | undefined
}

/**
 * The end-to-end connection from this browser to the paired Mac, from two facts:
 * the relay socket (`identified`) and what the relay reports about the Mac.
 *
 * - `loading`: the relay has not answered yet (no state frame). Spinner.
 * - `connecting`: the socket dropped and is retrying on its own. Flashing dot.
 * - `connected`: socket open, Mac online.
 * - `offline`: socket open, Mac not connected to the relay. Only the Mac can fix it.
 */
export type HostConnection =
  | { readonly status: 'loading' }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
  | { readonly status: 'offline' }

export type HostConnectionStatus = HostConnection['status']

/** Socket first, then the Mac. Pure, so every branch is a one-line test. */
export function hostConnectionFrom({ identified, state }: RelayConnection): HostConnection {
  if (state === undefined) return { status: 'loading' }
  if (!identified) return { status: 'connecting' }
  return state.hostStatus === 'online' ? { status: 'connected' } : { status: 'offline' }
}
