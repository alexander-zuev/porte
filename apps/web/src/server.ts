import { setLoggerErrorHook } from '@porte/core'
import * as Sentry from '@sentry/cloudflare'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { scheduledHandler } from './server/entrypoints/scheduled/scheduled-handler.ts'
import { createAppDeps } from './server/infrastructure/app-deps'
import { createSentryOptions } from './server/infrastructure/observability/sentry-options.ts'
import type { RuntimeEnv } from './server/infrastructure/runtime-env.ts'
import { handleRelayUpgrade, isRelayUpgrade } from './server/infrastructure/ws/relay-upgrade.ts'

export { HostRelayDO } from './server/infrastructure/durable-objects/host-relay-do'

setLoggerErrorHook(({ error, distinctId, context }) => {
  Sentry.captureException(error, {
    extra: context,
    ...(distinctId && { user: { id: distinctId } }),
  })
})

// @ts-expect-error -- Sentry documents this TanStack and Cloudflare handler type mismatch.
const serverEntry = createServerEntry(wrapFetchWithSentry(handler))

export default Sentry.withSentry(createSentryOptions, {
  fetch(request, env, ctx) {
    const deps = createAppDeps(env, ctx)

    // Before the router: its response merge destroys the upgrade's headers.
    if (isRelayUpgrade(request)) return handleRelayUpgrade(request, deps)

    return serverEntry.fetch(request, { context: { deps } })
  },
  scheduled(controller, env, ctx) {
    return scheduledHandler(controller, createAppDeps(env, ctx))
  },
}) satisfies ExportedHandler<RuntimeEnv>
