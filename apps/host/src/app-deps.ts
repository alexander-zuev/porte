import type { HostConfig } from './config.ts'
import { GrokSessionAgentStarter } from './grok/grok-session-agent.ts'
import { HostConnector } from './host/connect-host.ts'
import type { HostRelayObserver } from './host/host-relay.ts'
import { SystemHostClock } from './host/system-host-clock.ts'
import { WebSocketHostRelay } from './host/websocket-host-relay.ts'
import { SessionCatalog } from './sessions/session-catalog.ts'
import { SessionResumer } from './sessions/session-resumer.ts'
import { SessionStore } from './sessions/session-store.ts'

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
  const store = new SessionStore(config.grokHome)
  const catalog = new SessionCatalog(store)

  return {
    sessions: {
      catalog,
      resumer: new SessionResumer(store, new GrokSessionAgentStarter()),
    },
    host: new HostConnector(catalog, new SystemHostClock(), new WebSocketHostRelay(observer)),
  }
}
