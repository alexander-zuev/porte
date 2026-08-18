import type { user } from './auth.schema'

export type DbUser = typeof user.$inferSelect
