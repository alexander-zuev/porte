import { createLogger } from '@porte/core'
import { forgetStalePairingRequests } from '@server/application/commands/forget-stale-pairing-requests.command.ts'
import type { AppDeps } from '@server/infrastructure/app-deps.ts'

import { CRON, CronSchema, type CronExpression } from './cron-registry.ts'

const logger = createLogger('scheduled')

/**
 * What each schedule runs.
 *
 * A table rather than a switch, so a schedule added to the registry without
 * work to do fails to compile instead of falling through at run time.
 */
const RUNS = {
  [CRON.EVERY_15_MINUTES]: async (deps: AppDeps, at: Date) => {
    await forgetStalePairingRequests(deps.pairingOrigins, at)
  },
} satisfies Record<CronExpression, ScheduledRun>

/** Nothing is returned to the platform, so each run reports its own outcome. */
type ScheduledRun = (deps: AppDeps, at: Date) => Promise<void>

/**
 * Route one Cloudflare schedule to its work.
 *
 * Porte has no queue, so the work runs inline. This routes and nothing else;
 * each command reports what it did, because each is what knows.
 */
export async function scheduledHandler(
  controller: ScheduledController,
  deps: AppDeps,
): Promise<void> {
  const parsed = CronSchema.safeParse(controller.cron)
  if (!parsed.success) {
    // Wrangler fires a schedule nothing routes. Loud here beats silent.
    logger.error('scheduled_unknown_cron', { details: { cron: controller.cron } })
    return
  }

  await RUNS[parsed.data](deps, new Date(controller.scheduledTime))
}
