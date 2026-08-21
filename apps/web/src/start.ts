import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createStart } from '@tanstack/react-start'

import { csrfMiddleware } from './server/entrypoints/middleware/csrf.middleware.ts'
import { d1SessionMiddleware } from './server/entrypoints/middleware/d1.middleware.ts'
import { functionErrorMiddleware } from './server/entrypoints/middleware/error.middleware.ts'

/** Order matters: CSRF before D1 opens a session, Sentry before the boundary. */
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, sentryGlobalRequestMiddleware, d1SessionMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware, functionErrorMiddleware],
}))
