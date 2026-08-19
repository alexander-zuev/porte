import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

/** Server functions are same-origin RPC, so reject cross-site callers. */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/** Register global TanStack middleware before application middleware. */
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, sentryGlobalRequestMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
