import { createFileRoute } from '@tanstack/react-router'

import { routeErrorMiddleware } from '#/server/middleware/error.middleware.ts'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    middleware: [routeErrorMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        return context.deps.auth().handler(request)
      },
      POST: async ({ request, context }) => {
        return context.deps.auth().handler(request)
      },
    },
  },
})
