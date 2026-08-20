import { connectHost } from '@server/application/commands/connect-host.command.ts'
import { requireAuthRequest } from '@server/entrypoints/middleware/auth.middleware.ts'
import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import { requireWebSocketUpgrade } from '@server/entrypoints/middleware/websocket.middleware.ts'
import { ApiRouteError } from '@server/errors/api-route.error.ts'
import { createFileRoute } from '@tanstack/react-router'

/**
 * Where a daemon and a browser both reach the relay.
 *
 * The middleware turns a credential into an account and refuses anything that
 * is not an upgrade. The command turns an account into its Mac. This maps the
 * answer and nothing else.
 */
export const Route = createFileRoute('/api/host/ws')({
  server: {
    middleware: [routeErrorMiddleware, requireAuthRequest, requireWebSocketUpgrade],
    handlers: {
      GET: async ({ request, context }) => {
        const connected = await connectHost(context.deps.hosts, context.deps.hostCoordinator, {
          userId: context.userId,
          request,
        })

        if (!connected.ok) {
          throw new ApiRouteError({
            error: {
              code: 'NOT_AUTHORIZED',
              message:
                connected.reason === 'unpaired'
                  ? 'This account has no paired Mac'
                  : 'This pairing was revoked',
            },
          })
        }

        return connected.response
      },
    },
  },
})
