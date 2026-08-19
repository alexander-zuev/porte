import { createFileRoute } from '@tanstack/react-router'

import { getAuthInstance } from '#/server/infrastructure/auth/auth.ts'
import { routeErrorMiddleware } from '#/server/middleware/error.middleware.ts'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    middleware: [routeErrorMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        return getAuthInstance(context.deps).handler(request)
      },
      POST: async ({ request, context }) => {
        return getAuthInstance(context.deps).handler(request)
      },
    },
  },
})
