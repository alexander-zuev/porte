import type { ConnectHost, HostCoordinator } from '../../application/ports/host-coordinator'

/** Typed client for the Host Durable Object binding. */
export class HostCoordinatorClient implements HostCoordinator {
  constructor(private readonly hosts: DurableObjectNamespace) {}

  connect(input: ConnectHost): Promise<Response> {
    const headers = new Headers(input.request.headers)
    headers.delete('authorization')
    headers.set('x-porte-host-role', input.role)
    const request = new Request(input.request, { headers })
    return this.hosts.getByName(input.hostId).fetch(request)
  }
}
