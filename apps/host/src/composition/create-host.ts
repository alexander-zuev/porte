import { GrokAgent } from '../adapters/grok/grok-agent.ts'
import {
  WebSocketPorteRelay,
  type PorteRelayObserver,
} from '../adapters/websocket/websocket-porte-relay.ts'
import { HostController } from '../application/host-controller.ts'
import type { CodingAgent } from '../application/ports/coding-agent.ts'
import type { HostConfig } from './host-config.ts'

/** Host capabilities constructed for one CLI process. */
export type HostComposition = {
  readonly agent: CodingAgent
  readonly controller: HostController
}

/** Select the coding-agent adapter and connect application ports. */
export function createHost(config: HostConfig, observer: PorteRelayObserver): HostComposition {
  const agent = new GrokAgent({ grokHome: config.grokHome })
  const relay = new WebSocketPorteRelay(observer)
  return { agent, controller: new HostController(agent, relay) }
}
