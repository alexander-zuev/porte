import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/d1'

import { createBetterAuthOptions } from './options.ts'

// SAFETY: CLI schema generation never queries D1. The adapter only needs a typed handle.
const database = drizzleAdapter(drizzle({} as D1Database), { provider: 'sqlite' })

/** CLI-only instance for `better-auth-generate`. Do not import from the Worker. */
export const auth = betterAuth(createBetterAuthOptions(database))
