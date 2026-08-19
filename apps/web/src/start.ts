import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { d1SessionMiddleware } from './server/entrypoints/middleware/d1.middleware.ts'

/** Server functions are same-origin RPC, so reject cross-site callers. */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/**
 * Register global TanStack middleware before application middleware.
 *
 * D1 comes last, so a request rejected for CSRF never opens a session.
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, sentryGlobalRequestMiddleware, d1SessionMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
