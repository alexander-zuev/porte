import { setLoggerErrorHook } from '@porte/core'
import * as Sentry from '@sentry/cloudflare'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { scheduledHandler } from './server/entrypoints/scheduled/scheduled-handler.ts'
import { createSentryOptions } from './server/infrastructure/observability/sentry-options.ts'
import { createPorteWorkerResources } from './server/infrastructure/porte-worker-resources'
import type { RuntimeEnv } from './server/infrastructure/runtime-env.ts'

// Not wrapped with `instrumentAgentWithSentry`: agents 0.22.0 installs the DO handlers as
// non-writable instance properties and Sentry 10.70 assigns over them, which throws in the
// constructor. Errors still reach Sentry through the logger hook below.
export { ConversationAgent } from './server/infrastructure/durable-objects/conversation-agent'
export { HostRelayAgent } from './server/infrastructure/durable-objects/host-relay-agent'

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
    const deps = createPorteWorkerResources(env, ctx)
    return serverEntry.fetch(request, { context: { deps } })
  },
  scheduled(controller, env, ctx) {
    return scheduledHandler(controller, createPorteWorkerResources(env, ctx))
  },
}) satisfies ExportedHandler<RuntimeEnv>
