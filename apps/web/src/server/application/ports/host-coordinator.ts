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
export interface HostCoordinator {
  connect(input: ConnectHost): Promise<Response>
}
