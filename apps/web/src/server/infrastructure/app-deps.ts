import type { HostRelay } from '../application/ports/host-relay'
import type { PairingAuthority } from '../application/ports/pairing-authority.ts'
import type { PairingOrigins } from '../application/ports/pairing-origins.ts'
import type { HostRepository } from '../domain/host/host.repository.ts'
import { getAuthInstance } from './auth/auth.ts'
import { BetterAuthPairingAuthority } from './auth/better-auth-pairing-authority.ts'
import { createAuthRateLimitStorage } from './cloudflare/auth-rate-limit.ts'
import { DurableObjectHostRelay } from './cloudflare/durable-object-host-relay'
import { createKvSecondaryStorage } from './cloudflare/kv-secondary-storage.ts'
import { createDatabase } from './persistence/database/connection.ts'
import type { Db } from './persistence/database/types.ts'
import { DrizzleHostRepository } from './persistence/repositories/host.repository.ts'
import { DrizzlePairingOrigins } from './persistence/repositories/pairing-origins.repository.ts'
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
  /** Pairing codes, run by the device authorization plugin. Request-scoped. */
  pairingAuthority: PairingAuthority
  /** Where each pairing code was asked for. Written when one is issued. */
  pairingOrigins: PairingOrigins
  hostRelay: HostRelay
  executionCtx: BackgroundWork
}

/**
 * Somewhere to hand work that outlives the response.
 *
 * Only `waitUntil` is ever used, and a Worker request and a relay both offer
 * one. Naming that much lets the relay build the same dependencies as everything
 * else instead of assembling its own.
 */
export type BackgroundWork = Pick<ExecutionContext, 'waitUntil'>

/** Construct Worker adapters from generated Cloudflare bindings. */
export function createAppDeps(env: RuntimeEnv, executionCtx: BackgroundWork): AppDeps {
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
    // Same reason it takes the getter: the auth instance is built on first use.
    pairingAuthority: new BetterAuthPairingAuthority(() => deps.auth()),
    pairingOrigins: new DrizzlePairingOrigins(() => current()),
    executionCtx,
    hostRelay: new DurableObjectHostRelay(env.HOST),
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
