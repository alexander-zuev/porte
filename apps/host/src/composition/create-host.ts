import { GrokAgent } from '../adapters/grok/grok-agent.ts'
import { FileCredentialStore } from '../adapters/node/credential-store.ts'
import { DeviceAuthorizationClient } from '../adapters/porte/device-authorization-client.ts'
import {
  WebSocketPorteRelay,
  type PorteRelayObserver,
} from '../adapters/websocket/websocket-porte-relay.ts'
import { HostController } from '../application/host-controller.ts'
import type { CodingAgent } from '../application/ports/coding-agent.ts'
import type { CredentialStore } from '../application/ports/credential-store.ts'
import type { DeviceAuthorizer } from '../application/ports/device-authorizer.ts'
import type { HostConfig } from './host-config.ts'

/** Host capabilities constructed for one CLI process. */
export type HostComposition = {
  readonly agent: CodingAgent
  readonly controller: HostController
  readonly credentials: CredentialStore
  readonly authorizer: DeviceAuthorizer
}

/**
 * Build every adapter this process can use, and connect the application ports.
 *
 * Commands receive this and dispatch. Nothing outside here decides which
 * implementation backs a port, so swapping one is a change in a single file.
 */
export function createHost(config: HostConfig, observer: PorteRelayObserver): HostComposition {
  const agent = new GrokAgent({ grokHome: config.grokHome })
  const relay = new WebSocketPorteRelay(observer)

  return {
    agent,
    controller: new HostController(agent, relay),
    credentials: new FileCredentialStore(config.credentialPath),
    authorizer: new DeviceAuthorizationClient(config.baseUrl),
  }
}
