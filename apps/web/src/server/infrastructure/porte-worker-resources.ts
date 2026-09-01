import { NULL_ANALYTICS, PostHogAnalytics, type AnalyticsService } from '@porte/core'
import type { PairingAuthority } from '@server/application/ports/pairing-authority.ts'
import type { PairingOrigins } from '@server/application/ports/pairing-origins.ts'
import type { Transcription } from '@server/application/ports/transcription.ts'
import type { HostRepository } from '@server/domain/host/host.repository.ts'
import type { IConversationAgentClient } from '@web/server/application/ports/conversation-agent-client.ts'
import type { IHostRelayClient } from '@web/server/application/ports/host-agent-client.ts'

import { WorkersAiTranscription } from './ai/workers-ai-transcription.ts'
import { getAuthInstance } from './auth/auth.ts'
import { BetterAuthPairingAuthority } from './auth/better-auth-pairing-authority.ts'
import { createAuthRateLimitStorage } from './cloudflare/auth-rate-limit.ts'
import { createKvSecondaryStorage } from './cloudflare/kv-secondary-storage.ts'
import { ConversationAgentClient } from './durable-objects/conversation-agent-client.ts'
import { HostRelayClient } from './durable-objects/host-relay-client.ts'
import { ImageFetcher } from './images/image-fetcher.ts'
import {
  SentryObservabilityService,
  type ObservabilityService,
} from './observability/sentry-observability-service.ts'
import { createDatabase } from './persistence/database/connection.ts'
import type { Db } from './persistence/database/types.ts'
import { DrizzleHostRepository } from './persistence/repositories/host.repository.ts'
import { DrizzlePairingOrigins } from './persistence/repositories/pairing-origins.repository.ts'
import type { RuntimeEnv } from './runtime-env.ts'

export type AuthInstance = ReturnType<typeof getAuthInstance>

/** Dependencies constructed for one Worker invocation. */
export type PorteWorkerResources = {
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
  conversationAgent: IConversationAgentClient
  hostRelay: IHostRelayClient
  /** Turns composer voice recordings into text. */
  transcription: Transcription
  /** Fetches external images without exposing their HTTP response. */
  imageFetcher: ImageFetcher
  executionCtx: BackgroundWork
  /** Boundaries that report outward, or resolve who is asking. */
  services: {
    analytics: () => AnalyticsService
    observability: () => ObservabilityService
  }
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
export function createPorteWorkerResources(
  env: RuntimeEnv,
  executionCtx: BackgroundWork,
): PorteWorkerResources {
  // Lazy primary handle. A request may swap in a replica-routed session through
  // useDb; background contexts never rebind and stay on the primary.
  const rootDb = once(() => createDatabase(env.DB))
  let current: () => Db = rootDb

  const resources: PorteWorkerResources = {
    env,
    db: () => current(),
    useDb: (next) => {
      current = () => next
    },
    // Self-reference into the composition root. The factory runs on first call,
    // long after deps is built, so reading deps here is safe.
    auth: once(() => getAuthInstance(resources)),
    authStorage: createKvSecondaryStorage(env.AUTH_KV),
    authRateLimit: createAuthRateLimitStorage(env.AUTH_RATE_LIMIT),
    hosts: new DrizzleHostRepository(() => current()),
    // Same reason it takes the getter: the auth instance is built on first use.
    pairingAuthority: new BetterAuthPairingAuthority(() => resources.auth()),
    pairingOrigins: new DrizzlePairingOrigins(() => current()),
    conversationAgent: new ConversationAgentClient(env.HOST_RELAY_AGENT),
    executionCtx,
    hostRelay: new HostRelayClient(env.HOST_RELAY_AGENT),
    imageFetcher: new ImageFetcher(),
    transcription: new WorkersAiTranscription(env.AI),
    services: {
      // A test run reports to nobody, and the type says so: the key is a secret
      // the test environment never carries.
      analytics: once(() =>
        env.ENVIRONMENT === 'test'
          ? NULL_ANALYTICS
          : PostHogAnalytics.create({
              apiKey: env.POSTHOG_API_KEY,
              environment: env.ENVIRONMENT,
              source: 'worker',
              waitUntil: (promise) => {
                executionCtx.waitUntil(promise)
              },
            }),
      ),
      observability: once<ObservabilityService>(() => new SentryObservabilityService()),
    },
  }

  return resources
}

/** Defer a dependency to first use and build it at most once per request. */
function once<T>(factory: () => T): () => T {
  let value: T | undefined

  return () => {
    value ??= factory()
    return value
  }
}
