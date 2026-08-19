import type { HostAuthenticator } from '../application/ports/host-authenticator'
import type { HostCoordinator } from '../application/ports/host-coordinator'
import { DevelopmentHostAuthenticator } from './auth/development-host-authenticator'
import { HostCoordinatorClient } from './cloudflare/host-coordinator-client'
import { createKvSecondaryStorage } from './cloudflare/kv-secondary-storage.ts'
import { createDatabase } from './persistence/database/connection.ts'
import type { Db } from './persistence/database/types.ts'
import type { RuntimeEnv } from './runtime-env.ts'

/** Dependencies constructed for one Worker invocation. */
export type AppDeps = {
  env: RuntimeEnv
  db: () => Db
  /** Rebind the connection for this request, so reads can route to a replica. */
  useDb: (db: Db) => void
  /** Short-lived auth records, kept out of D1. */
  authStorage: ReturnType<typeof createKvSecondaryStorage>
  hostAuthenticator: HostAuthenticator
  hostCoordinator: HostCoordinator
  executionCtx: ExecutionContext
}

/** Construct Worker adapters from generated Cloudflare bindings. */
export function createAppDeps(env: RuntimeEnv, executionCtx: ExecutionContext): AppDeps {
  // Starts on the primary. A request may swap in a replica-routed session.
  let db = createDatabase(env.DB)

  return {
    env,
    db: () => db,
    useDb: (next) => {
      db = next
    },
    authStorage: createKvSecondaryStorage(env.AUTH_KV),
    executionCtx,
    hostAuthenticator: new DevelopmentHostAuthenticator(
      env.PORTE_DEV_DAEMON_TOKEN,
      env.PORTE_DEV_CLIENT_TOKEN,
    ),
    hostCoordinator: new HostCoordinatorClient(env.HOST),
  }
}
