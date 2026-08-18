import { createFileRoute } from '@tanstack/react-router'

import { createAuth } from '#/server/infrastructure/auth/auth.ts'
import { routeErrorMiddleware } from '#/server/middleware/error.middleware.ts'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    middleware: [routeErrorMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        return createAuth(context.deps).handler(request)
      },
      POST: async ({ request, context }) => {
        return createAuth(context.deps).handler(request)
      },
    },
  },
})
