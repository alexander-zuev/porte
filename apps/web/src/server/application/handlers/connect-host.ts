import type { HostCoordinator, ConnectHost } from '../ports/host-coordinator'

export type ConnectHostDeps = {
  hostCoordinator: HostCoordinator
}

/** Route one authenticated WebSocket upgrade to its host coordinator. */
export function connectHost(command: ConnectHost, deps: ConnectHostDeps): Promise<Response> {
  return deps.hostCoordinator.connect(command)
}
