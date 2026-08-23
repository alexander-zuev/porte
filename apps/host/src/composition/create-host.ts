import { dirname, join } from 'node:path'

import { GrokAgent } from '@host/adapters/grok/grok-agent.ts'
import { FileCredentialStore } from '@host/adapters/node/credential-store.ts'
import { FileHostLedger } from '@host/adapters/node/host-ledger.ts'
import { DeviceAuthorizationClient } from '@host/adapters/porte/device-authorization-client.ts'
import { WebSocketPorteRelay } from '@host/adapters/websocket/websocket-porte-relay.ts'
import { HostController } from '@host/application/host-controller.ts'
import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { CredentialStore } from '@host/application/ports/credential-store.ts'
import type { DeviceAuthorizer } from '@host/application/ports/device-authorizer.ts'
import type { PorteRelayObserver } from '@host/application/ports/porte-relay.ts'

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
  const ledger = new FileHostLedger(join(dirname(config.credentialPath), 'relay-ledger.json'))
  const relay = new WebSocketPorteRelay(observer, ledger)

  return {
    agent,
    controller: new HostController(agent, relay),
    credentials: new FileCredentialStore(config.credentialPath),
    authorizer: new DeviceAuthorizationClient(config.baseUrl),
  }
}
