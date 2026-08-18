import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import type { AppDeps } from '../app-deps.ts'
import { createBetterAuthOptions } from './options.ts'

/** Better Auth for one Worker request. Bindings are read here, not at import time. */
export function createAuth(deps: AppDeps) {
  const env = deps.env
  const database = drizzleAdapter(deps.db(), { provider: 'sqlite' })

  return betterAuth(
    createBetterAuthOptions(
      database,
      {
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
        githubClientId: env.GITHUB_CLIENT_ID,
        githubClientSecret: env.GITHUB_CLIENT_SECRET,
        twitterClientId: env.TWITTER_CLIENT_ID,
        twitterClientSecret: env.TWITTER_CLIENT_SECRET,
        vercelClientId: env.VERCEL_CLIENT_ID,
        vercelClientSecret: env.VERCEL_CLIENT_SECRET,
        turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
      },
      [tanstackStartCookies()],
    ),
  )
}
