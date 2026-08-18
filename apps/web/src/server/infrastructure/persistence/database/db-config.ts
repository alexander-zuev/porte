import type { DrizzleConfig } from 'drizzle-orm'

import * as schema from './schema'

/** Shared Drizzle config for the Worker D1 connection and drizzle-kit. */
export const config = {
  casing: 'snake_case',
  logger: false,
  schema,
} satisfies DrizzleConfig<typeof schema>
