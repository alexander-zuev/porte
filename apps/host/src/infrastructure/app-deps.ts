import { AcpClientFactory } from '../acp/acp-client.ts'
import { HostConnector } from '../application/connect-host.ts'
import type { HostRelayObserver } from '../application/ports/host-relay.ts'
import type { HostConfig } from '../config.ts'
import { GrokCodingAgentSessions } from '../grok/grok-coding-agent-sessions.ts'
import { GrokSessionStore } from '../grok/grok-session-store.ts'
import { SessionCatalog } from '../sessions/session-catalog.ts'
import { SessionResumer } from '../sessions/session-resumer.ts'
import { WebSocketHostRelay } from './relay/websocket-host-relay.ts'
import { SystemHostClock } from './system/system-host-clock.ts'

/** Application capabilities constructed once for one host process. */
export type AppDeps = {
  readonly sessions: {
    readonly catalog: SessionCatalog
    readonly resumer: SessionResumer
  }
  readonly host: HostConnector
}

/** Construct host adapters and inject them into application capabilities. */
export function createAppDeps(config: HostConfig, observer: HostRelayObserver): AppDeps {
  const store = new GrokSessionStore(config.grokHome)
  const catalog = new SessionCatalog(store)
  const codingAgent = new GrokCodingAgentSessions(new AcpClientFactory())

  return {
    sessions: {
      catalog,
      resumer: new SessionResumer(store, codingAgent),
    },
    host: new HostConnector(catalog, new SystemHostClock(), new WebSocketHostRelay(observer)),
  }
}
