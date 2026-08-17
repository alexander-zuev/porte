import type { DaemonConfig } from './config.ts'
import {
  SystemHostClock,
  type ConnectHostDeps,
  type SessionCatalogReader,
} from './host/connect-host.ts'
import { WebSocketHostRelay, type HostRelayObserver } from './host/websocket-host-relay.ts'
import { listSessions } from './sessions/list-sessions.ts'
import { SessionStore } from './sessions/session-store.ts'

/** Dependencies that the daemon constructs once for one CLI process. */
export type AppDeps = {
  sessions: SessionStore
  host: ConnectHostDeps
}

/** Construct daemon modules from process configuration and entrypoint adapters. */
export function createAppDeps(config: DaemonConfig, observer: HostRelayObserver): AppDeps {
  const sessions = new SessionStore(config.grokHome)
  const catalog: SessionCatalogReader = {
    list: async () => listSessions(sessions),
  }

  return {
    sessions,
    host: {
      sessions: catalog,
      clock: new SystemHostClock(),
      relay: new WebSocketHostRelay(observer),
    },
  }
}
