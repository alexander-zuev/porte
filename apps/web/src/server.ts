import { setLoggerErrorHook } from '@porte/core'
import * as Sentry from '@sentry/cloudflare'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { scheduledHandler } from './server/entrypoints/scheduled/scheduled-handler.ts'
import { createAppDeps } from './server/infrastructure/app-deps'
import { ConversationAgent as ConversationAgentBase } from './server/infrastructure/durable-objects/conversation-agent'
import { HostRelayAgent as HostRelayAgentBase } from './server/infrastructure/durable-objects/host-relay-agent'
import { createSentryOptions } from './server/infrastructure/observability/sentry-options.ts'
import type { RuntimeEnv } from './server/infrastructure/runtime-env.ts'

export const ConversationAgent = Sentry.instrumentAgentWithSentry(
  createSentryOptions,
  ConversationAgentBase,
)
export const HostRelayAgent = Sentry.instrumentAgentWithSentry(
  createSentryOptions,
  HostRelayAgentBase,
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
    return serverEntry.fetch(request, { context: { deps } })
  },
  scheduled(controller, env, ctx) {
    return scheduledHandler(controller, createAppDeps(env, ctx))
  },
}) satisfies ExportedHandler<RuntimeEnv>
