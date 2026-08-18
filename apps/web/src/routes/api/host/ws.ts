import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { ApiRouteError } from '#/server/errors/api-route.error.ts'
import { routeErrorMiddleware } from '#/server/middleware/error.middleware.ts'

const bearerSchema = z.string().regex(/^Bearer\s+(.+)$/i)

export const Route = createFileRoute('/api/host/ws')({
  server: {
    middleware: [routeErrorMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
          throw new ApiRouteError({
            error: { code: 'INVALID_REQUEST', message: 'WebSocket upgrade required' },
            status: 426,
          })
        }

        const authenticated = await context.deps.hostAuthenticator.authenticate(
          bearerCredential(request),
        )
        if (!authenticated.success) {
          throw new ApiRouteError({ error: authenticated.error })
        }

        return context.deps.hostCoordinator.connect({
          hostId: authenticated.data.hostId,
          role: authenticated.data.role,
          request,
        })
      },
    },
  },
})

function bearerCredential(request: Request): string | undefined {
  const parsed = bearerSchema.safeParse(request.headers.get('authorization'))
  return parsed.success ? parsed.data.replace(/^Bearer\s+/i, '') : undefined
}
