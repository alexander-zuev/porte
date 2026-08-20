import type { HostId } from '@porte/core'

import type { ConnectHost, HostCoordinator } from '../../application/ports/host-coordinator'
import type { HostCoordinatorDO } from '../durable-objects/host-coordinator-do.ts'

/** Typed client for the Host Durable Object binding. */
export class HostCoordinatorClient implements HostCoordinator {
  constructor(private readonly hosts: DurableObjectNamespace<HostCoordinatorDO>) {}

  connect(input: ConnectHost): Promise<Response> {
    const headers = new Headers(input.request.headers)
    headers.delete('authorization')
    headers.set('x-porte-host-role', input.role)
    // The relay is addressed by name, which it cannot read back. It needs the
    // id to say which Mac it is holding when it records what it saw.
    headers.set('x-porte-host-id', input.hostId)
    const request = new Request(input.request, { headers })
    return this.hosts.getByName(input.hostId).fetch(request)
  }

  /** By RPC, not a request: there is no socket to upgrade, only sockets to end. */
  async disconnect(hostId: HostId): Promise<void> {
    await this.hosts.getByName(hostId).disconnectAll()
  }
}
