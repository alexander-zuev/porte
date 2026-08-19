import type { HostId } from '@porte/core'

import type { HostRole } from './host-authenticator'

export type ConnectHost = {
  hostId: HostId
  role: HostRole
  request: Request
}

/** Cloudflare binding capability required for one host connection. */
export interface HostCoordinator {
  connect(input: ConnectHost): Promise<Response>
}
