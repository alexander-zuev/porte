import { z } from 'zod'

/**
 * Known Cloudflare schedules. Keys name the time, not the work, because one
 * schedule may drive several commands. Wrangler's trigger arrays must hold
 * these exact expressions.
 */
export const CRON = {
  EVERY_15_MINUTES: '*/15 * * * *',
} as const

/**
 * Parse `controller.cron`, which the platform hands over as a bare string.
 *
 * A miss means Wrangler fires a schedule the handler does not route. That is
 * reported at the boundary rather than falling through to a default branch.
 */
export const CronSchema = z.enum(CRON)
export type CronExpression = z.infer<typeof CronSchema>
