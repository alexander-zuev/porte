import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import type { AppDeps } from '../app-deps.ts'
import { createBetterAuthOptions } from './options.ts'

/**
 * Create a configured Better Auth instance from Worker bindings.
 *
 * Bindings are read here, not at import time, because they are not populated
 * during Vite SSR module evaluation.
 *
 * Reads `deps.db()` at construction, so build it only after D1 middleware has
 * bound the request connection. `AppDeps.auth` enforces that by deferring to
 * first use.
 *
 * @param deps - Per-request composition root.
 */
export function getAuthInstance(deps: AppDeps) {
  const env = deps.env
  const database = drizzleAdapter(deps.db(), { provider: 'sqlite' })

  return betterAuth(
    createBetterAuthOptions(
      database,
      {
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
        googleClientId: env.GOOGLE_CLIENT_ID,
        googleClientSecret: env.GOOGLE_CLIENT_SECRET,
        appleClientId: env.APPLE_CLIENT_ID,
        appleTeamId: env.APPLE_TEAM_ID,
        appleKeyId: env.APPLE_KEY_ID,
        applePrivateKey: env.APPLE_PRIVATE_KEY,
        githubClientId: env.GITHUB_CLIENT_ID,
        githubClientSecret: env.GITHUB_CLIENT_SECRET,
        twitterClientId: env.TWITTER_CLIENT_ID,
        twitterClientSecret: env.TWITTER_CLIENT_SECRET,
        turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
        isDevelopment: env.ENVIRONMENT === 'dev',
        secondaryStorage: deps.authStorage,
        rateLimitStorage: deps.authRateLimit,
        waitUntil: (promise) => {
          deps.executionCtx.waitUntil(promise)
        },
      },
      [tanstackStartCookies()],
    ),
  )
}
