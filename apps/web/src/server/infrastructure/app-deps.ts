import type { ConnectHostDeps } from '../application/handlers/connect-host'
import type { HostAuthenticator } from '../application/ports/host-authenticator'
import { DevelopmentHostAuthenticator } from './auth/development-host-authenticator'
import { HostCoordinatorClient } from './cloudflare/host-coordinator-client'

/** Dependencies constructed for one Worker invocation. */
export type AppDeps = ConnectHostDeps & {
  hostAuthenticator: HostAuthenticator
  executionCtx: ExecutionContext
}

/** Construct Worker adapters from generated Cloudflare bindings. */
export function createAppDeps(env: Env, executionCtx: ExecutionContext): AppDeps {
  return {
    executionCtx,
    hostAuthenticator: new DevelopmentHostAuthenticator(
      env.LRAS_DEV_DAEMON_TOKEN,
      env.LRAS_DEV_CLIENT_TOKEN,
    ),
    hostCoordinator: new HostCoordinatorClient(env.HOST),
  }
}
