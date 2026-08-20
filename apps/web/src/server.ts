import { setLoggerErrorHook } from '@porte/core'
import * as Sentry from '@sentry/cloudflare'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { handleRelayUpgrade, isRelayUpgrade } from './server/entrypoints/relay-upgrade.ts'
import { scheduled as runScheduled } from './server/entrypoints/scheduled/scheduled-handler.ts'
import { createAppDeps } from './server/infrastructure/app-deps'
import type { AppDeps } from './server/infrastructure/app-deps'
import { HostRelayDO as HostRelayDOBase } from './server/infrastructure/durable-objects/host-relay-do'
import { createSentryOptions } from './server/infrastructure/observability/sentry-options.ts'
import type { RuntimeEnv } from './server/infrastructure/runtime-env.ts'

export const HostRelayDO = Sentry.instrumentDurableObjectWithSentry(
  createSentryOptions,
  HostRelayDOBase,
)

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

    // Before the router: a WebSocket upgrade is a protocol switch, not a page,
    // and its immutable headers cannot survive the router's response merge.
    if (isRelayUpgrade(request)) return handleRelayUpgrade(request, deps)

    return serverEntry.fetch(request, { context: { deps } })
  },
  scheduled(controller, env, ctx) {
    return runScheduled(controller, createAppDeps(env, ctx))
  },
}) satisfies ExportedHandler<RuntimeEnv>

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        deps: AppDeps
      }
    }
  }
}
