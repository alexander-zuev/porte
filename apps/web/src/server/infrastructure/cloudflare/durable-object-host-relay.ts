import type { HostId } from '@porte/core'

import type { ConnectHost, HostRelay } from '../../application/ports/host-relay'
import type { HostRelayDO } from '../durable-objects/host-relay-do.ts'
import { RELAY_HOST_ID_HEADER, RELAY_ROLE_HEADER } from '../durable-objects/relay/relay-headers.ts'

/** Typed client for the Host Durable Object binding. */
export class DurableObjectHostRelay implements HostRelay {
  constructor(private readonly hosts: DurableObjectNamespace<HostRelayDO>) {}

  connect(input: ConnectHost): Promise<Response> {
    const headers = new Headers(input.request.headers)
    // Spent: the relay has no use for it and no way to check it.
    headers.delete('authorization')
    headers.set(RELAY_ROLE_HEADER, input.role)
    headers.set(RELAY_HOST_ID_HEADER, input.hostId)
    const request = new Request(input.request, { headers })
    return this.hosts.getByName(input.hostId).fetch(request)
  }

  /** By RPC, not a request: there is no socket to upgrade, only sockets to end. */
  async disconnect(hostId: HostId): Promise<void> {
    await this.hosts.getByName(hostId).disconnectAll()
  }
}
