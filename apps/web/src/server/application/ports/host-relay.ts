import type { HostId } from '@porte/core'

/**
 * Which side of the relay a connection is.
 *
 * The relay holds one daemon and many clients, and frames travel opposite ways
 * between them, so it has to know which it is talking to. Derived from the
 * credential kind at the entrypoint, never announced in a frame: a client that
 * could call itself the daemon would receive every conversation.
 */
export type HostRole = 'daemon' | 'client'

export type ConnectHost = {
  hostId: HostId
  role: HostRole
  request: Request
}

/** Cloudflare binding capability required for one host connection. */
export interface HostRelay {
  connect(input: ConnectHost): Promise<Response>

  /**
   * Turn everyone out of one Mac's relay.
   *
   * Refusing the next connection is not enough: a daemon already holding a
   * socket would keep serving a pairing that has ended.
   */
  disconnect(hostId: HostId): Promise<void>
}
