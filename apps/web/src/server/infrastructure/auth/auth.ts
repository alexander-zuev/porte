import type { BetterAuthOptions } from 'better-auth'
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
 * @param deps - Per-request composition root.
 * @param additionalPlugins - Extra Better Auth plugins for this instance.
 */
export function getAuthInstance(deps: AppDeps, additionalPlugins?: BetterAuthOptions['plugins']) {
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
        appleClientSecret: env.APPLE_CLIENT_SECRET,
        githubClientId: env.GITHUB_CLIENT_ID,
        githubClientSecret: env.GITHUB_CLIENT_SECRET,
        twitterClientId: env.TWITTER_CLIENT_ID,
        twitterClientSecret: env.TWITTER_CLIENT_SECRET,
        turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
      },
      [tanstackStartCookies(), ...(additionalPlugins ?? [])],
    ),
  )
}
