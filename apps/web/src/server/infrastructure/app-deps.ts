import type { HostAuthenticator } from '../application/ports/host-authenticator'
import type { HostCoordinator } from '../application/ports/host-coordinator'
import type { HostRepository } from '../domain/host/host.repository.ts'
import { getAuthInstance } from './auth/auth.ts'
import { DevelopmentHostAuthenticator } from './auth/development-host-authenticator'
import { createAuthRateLimitStorage } from './cloudflare/auth-rate-limit.ts'
import { HostCoordinatorClient } from './cloudflare/host-coordinator-client'
import { createKvSecondaryStorage } from './cloudflare/kv-secondary-storage.ts'
import { createDatabase } from './persistence/database/connection.ts'
import type { Db } from './persistence/database/types.ts'
import { DrizzleHostRepository } from './persistence/repositories/host.repository.ts'
import type { RuntimeEnv } from './runtime-env.ts'

export type AuthInstance = ReturnType<typeof getAuthInstance>

/** Dependencies constructed for one Worker invocation. */
export type AppDeps = {
  env: RuntimeEnv
  db: () => Db
  /** Rebind the connection for this request, so reads can route to a replica. */
  useDb: (db: Db) => void
  /**
   * Better Auth for this request.
   *
   * Built on first use, not at construction, so it captures whichever connection
   * `useDb` has bound by then. Callers must not reach for it before D1 middleware.
   */
  auth: () => AuthInstance
  /** Short-lived auth records, kept out of D1. */
  authStorage: ReturnType<typeof createKvSecondaryStorage>
  /** Counts auth requests per address and path. */
  authRateLimit: ReturnType<typeof createAuthRateLimitStorage>
  /** Command-side persistence for the host aggregate. Queries read directly. */
  hosts: HostRepository
  hostAuthenticator: HostAuthenticator
  hostCoordinator: HostCoordinator
  executionCtx: ExecutionContext
}

/** Construct Worker adapters from generated Cloudflare bindings. */
export function createAppDeps(env: RuntimeEnv, executionCtx: ExecutionContext): AppDeps {
  // Lazy primary handle. A request may swap in a replica-routed session through
  // useDb; background contexts never rebind and stay on the primary.
  const rootDb = once(() => createDatabase(env.DB))
  let current: () => Db = rootDb

  const deps: AppDeps = {
    env,
    db: () => current(),
    useDb: (next) => {
      current = () => next
    },
    // Self-reference into the composition root. The factory runs on first call,
    // long after deps is built, so reading deps here is safe.
    auth: once(() => getAuthInstance(deps)),
    authStorage: createKvSecondaryStorage(env.AUTH_KV),
    authRateLimit: createAuthRateLimitStorage(env.AUTH_RATE_LIMIT),
    // Takes the getter, not the connection, so it follows a middleware rebind.
    hosts: new DrizzleHostRepository(() => current()),
    executionCtx,
    hostAuthenticator: new DevelopmentHostAuthenticator(
      env.PORTE_DEV_DAEMON_TOKEN,
      env.PORTE_DEV_CLIENT_TOKEN,
    ),
    hostCoordinator: new HostCoordinatorClient(env.HOST),
  }

  return deps
}

/** Defer a dependency to first use and build it at most once per request. */
function once<T>(factory: () => T): () => T {
  let value: T | undefined

  return () => {
    value ??= factory()
    return value
  }
}
