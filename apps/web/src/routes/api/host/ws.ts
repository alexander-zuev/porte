import { NotAuthorizedError } from '@porte/core/client'
import { connectHost } from '@server/application/commands/connect-host.command.ts'
import { requireAuthRequest } from '@server/entrypoints/middleware/auth.middleware.ts'
import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import { requireWebSocketUpgrade } from '@server/entrypoints/middleware/websocket.middleware.ts'
import { createFileRoute } from '@tanstack/react-router'

/** Join a daemon or browser to its HostRelayAgent. */
export const Route = createFileRoute('/api/host/ws')({
  server: {
    middleware: [routeErrorMiddleware, requireWebSocketUpgrade, requireAuthRequest],
    handlers: {
      GET: async ({ context, request }) => {
        const connected = await connectHost(context.deps.hosts, context.deps.hostRelay, {
          userId: context.user.id,
          request,
        })
        if (connected.ok) return connected.response

        throw new NotAuthorizedError()
      },
    },
  },
})
