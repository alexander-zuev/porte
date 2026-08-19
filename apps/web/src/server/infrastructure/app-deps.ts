import type { HostAuthenticator } from '../application/ports/host-authenticator'
import type { HostCoordinator } from '../application/ports/host-coordinator'
import { DevelopmentHostAuthenticator } from './auth/development-host-authenticator'
import { HostCoordinatorClient } from './cloudflare/host-coordinator-client'
import { createDatabase } from './persistence/database/connection.ts'
import type { Db } from './persistence/database/types.ts'
import type { RuntimeEnv } from './runtime-env.ts'

/** Dependencies constructed for one Worker invocation. */
export type AppDeps = {
  env: RuntimeEnv
  db: () => Db
  hostAuthenticator: HostAuthenticator
  hostCoordinator: HostCoordinator
  executionCtx: ExecutionContext
}

/** Construct Worker adapters from generated Cloudflare bindings. */
export function createAppDeps(env: RuntimeEnv, executionCtx: ExecutionContext): AppDeps {
  const db = createDatabase(env.DB)

  return {
    env,
    db: () => db,
    executionCtx,
    hostAuthenticator: new DevelopmentHostAuthenticator(
      env.PORTE_DEV_DAEMON_TOKEN,
      env.PORTE_DEV_CLIENT_TOKEN,
    ),
    hostCoordinator: new HostCoordinatorClient(env.HOST),
  }
}
