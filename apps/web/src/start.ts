import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { d1SessionMiddleware } from './server/entrypoints/middleware/d1.middleware.ts'
import { functionErrorMiddleware } from './server/entrypoints/middleware/error.middleware.ts'

/** Server functions are same-origin RPC, so reject cross-site callers. */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/**
 * Register global TanStack middleware before application middleware.
 *
 * D1 comes last, so a request rejected for CSRF never opens a session. The
 * error boundary comes after Sentry, so Sentry still sees what it wraps.
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, sentryGlobalRequestMiddleware, d1SessionMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware, functionErrorMiddleware],
}))
